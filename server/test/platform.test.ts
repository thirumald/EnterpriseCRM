import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { fresh, q, one, pool, startApi, minutes } from './helpers.ts';
import * as hd from '../src/helpdesk.ts';
import * as sla from '../src/slaService.ts';
import * as al from '../src/alerts.ts';
import * as mon from '../src/monitoring.ts';
import * as disc from '../src/discovery.ts';
import { EdgeCollector } from '../src/collector.ts';
import { injectFault, clearFault } from '../src/sim.ts';

let ids: any;
before(async () => { ids = await fresh(); });
after(async () => { await pool.end(); });

const timers = (tid: number) => q('SELECT * FROM sla_timers WHERE ticket_id=$1', [tid]).then((r) => Object.fromEntries(r.map((x: any) => [x.kind, x])));

test('ticket picks contract + SLA policy from the CRM profile and starts timers', async () => {
  const t = await hd.createTicket({ subject: 'ERP slow', priority: 'P1', account_id: ids.acme, ci_id: ids.acmeErp, channel: 'portal' });
  assert.equal(t.contract_name, 'Acme Managed Infrastructure');
  const tm = await timers(t.id);
  assert.equal(tm.response.target_min, 15);
  assert.equal(tm.resolution.target_min, 240);
  assert.equal(tm.resolution.clock, '24x7');
});

test('pause on Waiting on Customer, resume on customer reply, response met on first agent reply', async () => {
  const t = await hd.createTicket({ subject: 'VPN request', priority: 'P3', account_id: ids.initech, channel: 'email' }); // Silver, business hours
  let tm = await timers(t.id);
  assert.equal(tm.resolution.clock, 'business');
  await hd.reply(t.id, 'agent', 'alice.agent', 'Can you send logs?');
  tm = await timers(t.id);
  assert.equal(tm.response.state, 'met');
  await hd.setStatus(t.id, 'Waiting on Customer', 'alice.agent');
  tm = await timers(t.id);
  assert.equal(tm.resolution.state, 'paused');
  const remaining = tm.resolution.remaining_min;
  assert.ok(remaining > 0 && remaining <= 2400);
  await hd.reply(t.id, 'customer', 'ingrid@initech.example', 'logs attached');
  tm = await timers(t.id);
  assert.equal(tm.resolution.state, 'running');
  assert.equal((await hd.getTicket(t.id)).status, 'Open');
});

test('slaTick: warning at 75/90, breach, then L2/L3 escalation for P1', async () => {
  const start = new Date();
  const t = await hd.createTicket({ subject: 'Core outage', priority: 'P1', account_id: ids.acme, ci_id: ids.acmeDb }, start);
  const events: string[] = [];
  const { bus } = await import('../src/events.ts');
  const on = (e: any) => events.push(e.type);
  bus.on('event', on);
  await sla.slaTick(minutes(12, start));            // response 80% of 15
  assert.ok(events.includes('sla.warning'));
  await sla.slaTick(minutes(16, start));            // response breached
  let row = await hd.getTicket(t.id);
  assert.equal(row.sla_breached, true);
  assert.equal(row.escalation_level, 1);
  await sla.slaTick(minutes(240 + 31, start));      // resolution breached 31 min ago
  await sla.slaTick(minutes(240 + 31, start));
  row = await hd.getTicket(t.id);
  assert.ok(row.escalation_level >= 2);
  await sla.slaTick(minutes(240 + 125, start));
  row = await hd.getTicket(t.id);
  assert.equal(row.escalation_level, 3);
  bus.off('event', on);
  assert.ok(events.includes('sla.breached') && events.includes('sla.escalated'));
});

test('Alert -> Ticket -> SLA: critical on critical CI makes a P1 with timers; repeats dedupe; recovery auto-resolves', async () => {
  const id = await al.raiseAlert({ ci_id: ids.acmeDb, metric: 'cpu', severity: 'critical', value: 97, message: 'cpu critical (97)' });
  const a = await one('SELECT * FROM alerts WHERE id=$1', [id]);
  assert.ok(a.ticket_id);
  const t = await hd.getTicket(a.ticket_id);
  assert.equal(t.priority, 'P1'); assert.equal(t.channel, 'alert'); assert.equal(t.account_name, 'Acme Manufacturing');
  assert.ok(t.assignee);
  assert.equal(t.timers.length, 2);
  await al.raiseAlert({ ci_id: ids.acmeDb, metric: 'cpu', severity: 'critical', value: 98 });
  const dupes = await q(`SELECT count(*)::int n FROM tickets WHERE ci_id=$1 AND channel='alert' AND subject LIKE '%cpu%'`, [ids.acmeDb]);
  assert.equal(dupes[0].n, 1);
  assert.equal((await q('SELECT repeat_count FROM alerts WHERE id=$1', [id]))[0].repeat_count, 2);
  await al.closeAlert(ids.acmeDb, 'cpu');
  assert.equal((await hd.getTicket(t.id)).status, 'Resolved');
  // recurrence within 24h reopens rather than creating a new ticket
  await al.raiseAlert({ ci_id: ids.acmeDb, metric: 'cpu', severity: 'critical', value: 96 });
  assert.equal((await hd.getTicket(t.id)).status, 'Open');
  await al.closeAlert(ids.acmeDb, 'cpu', minutes(60)); // agent replied none -> auto-resolves again
});

test('warning alert only opens a P3 ticket after persisting (R2)', async () => {
  await al.raiseAlert({ ci_id: ids.acmeErp, metric: 'mem', severity: 'warning', value: 88 });
  const a = await one(`SELECT * FROM alerts WHERE fingerprint=$1 AND state<>'closed'`, [`${ids.acmeErp}:mem`]);
  assert.equal(a.ticket_id, null);
  assert.equal(await al.deferredAlertTickets(minutes(5)), 0);
  assert.equal(await al.deferredAlertTickets(minutes(16)), 1);
  const a2 = await one('SELECT * FROM alerts WHERE id=$1', [a.id]);
  assert.equal((await hd.getTicket(a2.ticket_id)).priority, 'P3');
});

test('shared infrastructure: one root-cause ticket, per-account impact tickets with own SLA, downstream alerts suppressed', async () => {
  await al.raiseAlert({ ci_id: ids.swA, metric: 'availability', severity: 'critical', value: 0, message: 'unreachable' });
  const root = await one(`SELECT t.* FROM alerts a JOIN tickets t ON t.id=a.ticket_id WHERE a.ci_id=$1 AND a.state<>'closed'`, [ids.swA]);
  assert.equal(root.priority, 'P1'); assert.equal(root.account_id, null);
  const kids = await q(`SELECT t.*, a.name account FROM tickets t JOIN accounts a ON a.id=t.account_id WHERE t.parent_ticket_id=$1 ORDER BY a.name`, [root.id]);
  assert.deepEqual(kids.map((k: any) => k.account), ['Acme Manufacturing', 'Globex Bank']);
  for (const k of kids) assert.equal((await q('SELECT 1 FROM sla_timers WHERE ticket_id=$1', [k.id])).length, 2);
  assert.equal((await one('SELECT state FROM config_items WHERE id=$1', [ids.swA])).state, 'DOWN');
  assert.equal((await one('SELECT state FROM config_items WHERE id=$1', [ids.globexApp])).state, 'UNKNOWN');
  // downstream server alert gets attached to the root cause instead of a new ticket
  const before = (await one('SELECT count(*)::int n FROM tickets')).n;
  await al.raiseAlert({ ci_id: ids.globexApp, metric: 'availability', severity: 'critical', value: 0 });
  assert.equal((await one('SELECT count(*)::int n FROM tickets')).n, before);
  const linked = await one(`SELECT ticket_id, root_cause_ci FROM alerts WHERE ci_id=$1 AND state<>'closed'`, [ids.globexApp]);
  assert.equal(linked.ticket_id, root.id); assert.equal(linked.root_cause_ci, ids.swA);
  // impact API
  const { impact } = await import('../src/cmdb.ts');
  const imp = await impact(ids.swA);
  assert.ok(imp.dependents.some((d: any) => d.name === 'GLOBEX-VM-07'));
  assert.deepEqual(imp.accounts.map((a: any) => a.name).sort(), ['Acme Manufacturing', 'Globex Bank']);
  await al.closeAlert(ids.swA, 'availability'); await al.closeAlert(ids.globexApp, 'availability');
  assert.equal((await one('SELECT state FROM config_items WHERE id=$1', [ids.globexApp])).state, 'UP');
});

test('uncovered asset alert -> P4 ticket + CRM opportunity (R4)', async () => {
  await al.raiseAlert({ ci_id: ids.initechPos, metric: 'cpu', severity: 'critical', value: 99 });
  const t = await one(`SELECT * FROM tickets WHERE ci_id=$1 AND channel='alert'`, [ids.initechPos]);
  assert.equal(t.priority, 'P4');
  const opp = await one(`SELECT * FROM opportunities WHERE account_id=$1 AND source='Uncovered asset alert'`, [ids.initech]);
  assert.ok(opp);
});

test('maintenance window suppresses alerts and creates no ticket (R12)', async () => {
  await q(`INSERT INTO maintenance_windows(name,ci_id,start_at,end_at) VALUES ('patching',$1,now()-interval '1 hour',now()+interval '1 hour')`, [ids.globexVm]);
  const before = (await one('SELECT count(*)::int n FROM tickets')).n;
  await al.raiseAlert({ ci_id: ids.globexVm, metric: 'cpu', severity: 'critical', value: 99 });
  assert.equal((await one('SELECT count(*)::int n FROM tickets')).n, before);
  assert.equal((await one(`SELECT suppressed FROM alerts WHERE ci_id=$1 AND metric='cpu'`, [ids.globexVm])).suppressed, true);
});

test('alert storm at one site becomes a single major incident with earlier tickets linked (R3)', async () => {
  await q(`UPDATE workflow_rules SET params = params || '{"storm_threshold":3}' WHERE code='R3'`);
  for (const c of [ids.dbSw, ids.dbSrv, ids.dbEnd]) await al.raiseAlert({ ci_id: c, metric: 'cpu', severity: 'critical', value: 99 });
  const majors = await q(`SELECT * FROM tickets WHERE type='Major Incident'`);
  assert.equal(majors.length, 1);
  assert.equal((await q('SELECT 1 FROM tickets WHERE parent_ticket_id=$1', [majors[0].id])).length, 2);
  // a 4th alert at the site joins the existing major incident
  await al.raiseAlert({ ci_id: ids.dbSw, metric: 'mem', severity: 'critical', value: 99 });
  assert.equal((await q(`SELECT 1 FROM tickets WHERE type='Major Incident'`)).length, 1);
  await q(`UPDATE workflow_rules SET params = params || '{"storm_threshold":5}' WHERE code='R3'`);
});

test('edge collector aggregates, survives a WAN outage with store-and-forward, and ingest is idempotent', async () => {
  const sent: number[] = [];
  const col = await one('SELECT id FROM collectors WHERE site_id=$1', [ids.east]);
  let ec = new EdgeCollector(col.id, ids.east, async (b) => { sent.push(b.seq); await mon.ingestBatch(b); }, 60);
  const t0 = Date.now();
  ec.wanUp = false;
  for (let i = 0; i < 12; i++) await ec.poll(t0 + i * 5000);
  await ec.flush(t0);
  assert.equal(ec.queue.length, 1, 'buffered while WAN down');
  assert.equal(sent.length, 0);
  for (let i = 0; i < 12; i++) await ec.poll(t0 + 60000 + i * 5000);
  await ec.flush(t0 + 60000);
  ec.wanUp = true;
  await ec.drain();
  assert.deepEqual(sent, [1, 2]);
  assert.equal(ec.queue.length, 0);
  const stat = await one('SELECT * FROM collectors WHERE id=$1', [col.id]);
  assert.ok(stat.raw_samples_total > stat.forwarded_points_total * 5, 'WAN reduction: raw samples >> forwarded aggregates');
  // replaying seq 1 is a no-op
  const again = await mon.ingestBatch({ collector_id: col.id, seq: 1, sent_at: new Date().toISOString(), points: [], alerts: [], raw_samples: 0 });
  assert.equal(again.duplicate, true);
});

test('edge collector detects a device failure locally (hysteresis), alerts reach Main DC and create a ticket', async () => {
  const col = await one('SELECT id FROM collectors WHERE site_id=$1', [ids.east]);
  const ec = new EdgeCollector(col.id, ids.east, (b) => mon.ingestBatch(b).then(() => {}), 60);
  ec.seq = (await one('SELECT last_seq FROM collectors WHERE id=$1', [col.id])).last_seq;
  injectFault(ids.waSw, 'availability', 'down');
  await ec.poll(); await ec.poll();
  await ec.flush();
  assert.equal((await q(`SELECT 1 FROM alerts WHERE ci_id=$1 AND state<>'closed'`, [ids.waSw])).length, 0, 'needs 3 consecutive failures');
  await ec.poll(); await ec.flush();
  const a = await one(`SELECT * FROM alerts WHERE ci_id=$1 AND metric='availability' AND state<>'closed'`, [ids.waSw]);
  assert.ok(a?.ticket_id, 'ticket created');
  clearFault(ids.waSw);
  for (let i = 0; i < 3; i++) await ec.poll();
  await ec.flush();
  assert.equal((await one('SELECT state FROM alerts WHERE id=$1', [a.id])).state, 'closed');
});

test('collector offline -> incident, site CIs UNKNOWN not DOWN, recovered on next batch (R20)', async () => {
  const col = await one('SELECT * FROM collectors WHERE site_id=$1', [ids.west]);
  await q(`UPDATE collectors SET last_heartbeat = now() - interval '10 minutes' WHERE id=$1`, [col.id]);
  await mon.collectorWatchdog(new Date(), 15);
  assert.equal((await one('SELECT status FROM collectors WHERE id=$1', [col.id])).status, 'STALE');
  const states = await q('SELECT DISTINCT state FROM config_items WHERE site_id=$1', [ids.west]);
  assert.deepEqual(states.map((s: any) => s.state), ['UNKNOWN']);
  assert.ok(await one(`SELECT 1 x FROM tickets WHERE description LIKE $1`, [`%[collector:${col.id}]%`]));
  await mon.ingestBatch({ collector_id: col.id, seq: 9999, sent_at: new Date().toISOString(), points: [], alerts: [], raw_samples: 0 });
  assert.equal((await one('SELECT status FROM collectors WHERE id=$1', [col.id])).status, 'ONLINE');
  assert.equal((await one(`SELECT status FROM tickets WHERE description LIKE $1`, [`%[collector:${col.id}]%`])).status, 'Resolved');
});

test('syslog + IoT/MQTT telemetry raise and clear alerts', async () => {
  assert.equal((await mon.handleSyslog('<187>Oct 25 10:00:00 sw-waw-e1 %LINK-3-UPDOWN: Interface Gi1/0/3, changed state to down')).matched, true);
  assert.ok(await one(`SELECT 1 x FROM alerts WHERE ci_id=$1 AND metric='link_state' AND state<>'closed'`, [ids.waSw]));
  await mon.handleSyslog('<189>Oct 25 10:05:00 sw-waw-e1 %LINK-3-UPDOWN: Interface Gi1/0/3, changed state to up');
  assert.equal((await q(`SELECT 1 FROM alerts WHERE ci_id=$1 AND metric='link_state' AND state<>'closed'`, [ids.waSw])).length, 0);
  await mon.ingestIot({ ci_id: ids.waTemp, topic: 'plant/waw/temperature', value: 37 });
  assert.ok(await one(`SELECT 1 x FROM alerts WHERE ci_id=$1 AND metric='temperature' AND severity='critical' AND state<>'closed'`, [ids.waTemp]));
  await mon.ingestIot({ ci_id: ids.waTemp, topic: 'plant/waw/temperature', value: 22 });
  assert.equal((await q(`SELECT 1 FROM alerts WHERE ci_id=$1 AND metric='temperature' AND state<>'closed'`, [ids.waTemp])).length, 0);
  await q(`UPDATE config_items SET last_seen = now() - interval '10 minutes' WHERE id=$1`, [ids.waTemp2]);
  assert.ok((await mon.iotStaleScan()) >= 1);
});

test('discovery: new device (R15), unidentified device -> security ticket (R16), IP conflict (R17), re-scan reconciles', async () => {
  const out = await disc.processDiscovery(ids.east, [
    { ip: `10.${ids.east}.1.150`, mac: 'aa:aa:aa:00:00:01', serial: 'SN-NEW-1', hostname: 'srv-new-1', ci_class: 'Server' },
    { ip: `10.${ids.east}.1.151`, mac: 'bb:bb:bb:00:00:02', hostname: 'mystery' },
    { ip: `10.${ids.east}.1.10`, mac: 'cc:cc:cc:00:00:03', hostname: 'impostor', ci_class: 'Server' },
  ]);
  assert.equal(out.created.length, 2); assert.equal(out.rogue.length, 1); assert.equal(out.conflicts.length, 1);
  const created = await one(`SELECT * FROM config_items WHERE serial='SN-NEW-1'`);
  assert.equal(created.lifecycle, 'Pending Review');
  assert.ok((await q('SELECT 1 FROM checks WHERE ci_id=$1', [created.id])).length >= 3, 'monitor template applied');
  const ipRow = await one(`SELECT * FROM ip_addresses WHERE ip=$1::inet`, [`10.${ids.east}.1.150`]);
  assert.equal(ipRow.ci_id, created.id);
  const again = await disc.processDiscovery(ids.east, [{ serial: 'SN-NEW-1', hostname: 'srv-new-1' }]);
  assert.equal(again.created.length, 0); assert.equal(again.updated.length, 1);
});

test('lifecycle: retiring a CI stops monitoring and releases IPs', async () => {
  const { setLifecycle } = await import('../src/cmdb.ts');
  await setLifecycle(ids.dbEnd ?? (await one(`SELECT id FROM config_items WHERE name='INITECH-KIOSK-DUB'`)).id, 'Retired', 'tester');
  const ci = await one(`SELECT id FROM config_items WHERE name='INITECH-KIOSK-DUB'`);
  assert.equal((await q('SELECT 1 FROM ip_addresses WHERE ci_id=$1', [ci.id])).length, 0);
  assert.equal((await q('SELECT 1 FROM checks WHERE ci_id=$1 AND (warn IS NOT NULL OR crit IS NOT NULL)', [ci.id])).length, 0);
});

test('warranty expiry and renewal-risk scans feed the CRM (R13, R14)', async () => {
  const n = await al.warrantyScan();
  assert.ok(n >= 2);
  assert.ok(await one(`SELECT 1 x FROM opportunities WHERE source='Warranty expiry' AND account_id=$1`, [ids.acme]));
  await q('UPDATE accounts SET health_score=40 WHERE id=$1', [ids.umbrella]);
  assert.ok((await al.renewalRiskScan()) >= 1);
  assert.ok(await one(`SELECT 1 x FROM activities WHERE kind='renewal_risk' AND account_id=$1`, [ids.umbrella]));
});

test('HTTP API: email threading, API idempotency, account 360, topology, NOC dashboard', async () => {
  const { createUser } = await import('../src/auth.ts');
  await createUser({ username: 'root', password: 'correct horse', role: 'admin' });
  const api = await startApi();
  const { cookie } = await api.login('root', 'correct horse');
  const j = async (p: string, init?: any) => { const r = await api.call(p, { method: init?.method, body: init?.body, cookie, headers: init?.headers, key: (/^\/(inbound|v1|ingest)/.test(p) ? 'test-api-key' : undefined) }); return { status: r.status, body: r.body }; };
  try {
    const e1 = await j('/inbound/email', { method: 'POST', body: { from: 'wendy@acme.example', subject: 'Printer offline', body: 'help' } });
    assert.equal(e1.body.action, 'created'); assert.equal(e1.body.ticket.account_name, 'Acme Manufacturing'); assert.equal(e1.body.ticket.channel, 'email');
    const e2 = await j('/inbound/email', { method: 'POST', body: { from: 'wendy@acme.example', subject: `Re: [${e1.body.ticket.number}] Printer offline`, body: 'still broken' } });
    assert.equal(e2.body.action, 'reply');
    const unknown = await j('/inbound/email', { method: 'POST', body: { from: 'x@unknown.example', subject: 'hi', body: 'x' } });
    assert.equal(unknown.body.ticket.queue, 'Triage');
    const a = await j('/v1/tickets', { method: 'POST', headers: { 'Idempotency-Key': 'k1' }, body: { subject: 'API ticket', account_id: ids.globex } });
    const b = await j('/v1/tickets', { method: 'POST', headers: { 'Idempotency-Key': 'k1' }, body: { subject: 'API ticket', account_id: ids.globex } });
    assert.equal(a.body.id, b.body.id); assert.equal(a.body.channel, 'api');
    const detail = await j(`/tickets/${a.body.id}`);
    assert.ok(detail.body.events.length >= 1 && detail.body.timers.length === 2);
    const acct = await j(`/accounts/${ids.acme}`);
    assert.ok(acct.body.assets.length >= 4 && acct.body.contracts.length === 1 && 'sla_attainment' in acct.body.stats);
    assert.equal(acct.body.assets.find((x: any) => x.name === 'ACME-ERP-01').covered, true);
    const topo = await j(`/topology?site_id=${ids.main}`);
    assert.ok(topo.body.nodes.length >= 8 && topo.body.edges.length >= 6);
    const noc = await j('/dashboard/noc');
    assert.ok(noc.body.tickets.open > 0 && Array.isArray(noc.body.collectors));
    const tl = await j('/tickets?status=active&q=Printer');
    assert.equal(tl.status, 200); assert.ok(tl.body.length >= 1);
    const rules = await j('/rules');
    assert.ok(rules.body.length >= 15);
    const off = await j('/rules/R5', { method: 'PATCH', body: { enabled: false } });
    assert.equal(off.body.enabled, false);
    await j('/rules/R5', { method: 'PATCH', body: { enabled: true } });
    const ci = await j(`/cis/${ids.acmeErp}`);
    assert.ok(ci.body.dependsOn.length >= 1 && ci.body.contracts.length === 1 && ci.body.impact);
    const subnets = await j('/ipam/subnets');
    assert.ok(subnets.body[0].total > 0);
    const dup = await j('/ipam/ips', { method: 'POST', body: { ip: '10.0.0.1', ci_id: ids.acmeErp } });
    assert.equal(dup.status, 409);
  } finally { api.close(); }
});
