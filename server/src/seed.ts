import { q, one, resetDb, pool } from './db.ts';
import { seedRules } from './alerts.ts';
import { applyTemplate } from './discovery.ts';
import { fileURLToPath } from 'node:url';

const bh = { '0': null, '1': [540, 1020], '2': [540, 1020], '3': [540, 1020], '4': [540, 1020], '5': [540, 1020], '6': null };
const day = (n: number) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

export async function seed() {
  await seedRules();
  const cal = (await one(`INSERT INTO business_calendars(name,utc_offset_min,hours,holidays) VALUES ('Business hours 09-17 UTC',0,$1,$2) RETURNING id`, [bh, [day(14)]])).id;
  const pol = async (name: string, tier: string, targets: any, esc: any, calendar = cal) =>
    (await one('INSERT INTO sla_policies(name,tier,calendar_id,targets,escalation) VALUES ($1,$2,$3,$4,$5) RETURNING id', [name, tier, calendar, targets, esc])).id;
  const t = (r: number, s: number, clock = '24x7') => ({ response: r, resolution: s, clock });
  const platinum = await pol('Platinum 24x7', 'Platinum', { P1: t(15, 240), P2: t(30, 480), P3: t(120, 2880), P4: t(240, 7200) }, { warn: [75, 90], l2_after_min: 30, l3_after_min: 120 });
  const gold = await pol('Gold', 'Gold', { P1: t(30, 480), P2: t(60, 720), P3: t(240, 1440, 'business'), P4: t(480, 3360, 'business') }, { warn: [75, 90], l2_after_min: 30, l3_after_min: 120 });
  const silver = await pol('Silver', 'Silver', { P1: t(60, 720, 'business'), P2: t(120, 960, 'business'), P3: t(480, 2400, 'business'), P4: t(1440, 4800, 'business') }, { warn: [75, 90], l2_after_min: 60, l3_after_min: 240 });
  await pol('Bronze', 'Bronze', { P1: t(240, 960, 'business'), P2: t(480, 1920, 'business'), P3: t(1440, 3360, 'business'), P4: t(2880, 7200, 'business') }, { warn: [75, 90], l2_after_min: 120, l3_after_min: 480 });

  const acc = async (name: string, tier: string, industry: string, owner: string, domain: string) =>
    (await one('INSERT INTO accounts(name,tier,industry,owner,email_domain) VALUES ($1,$2,$3,$4,$5) RETURNING id', [name, tier, industry, owner, domain])).id;
  const acme = await acc('Acme Manufacturing', 'Platinum', 'Manufacturing', 'mia.manager', 'acme.example');
  const globex = await acc('Globex Bank', 'Gold', 'Financial Services', 'mia.manager', 'globex.example');
  const initech = await acc('Initech Retail', 'Silver', 'Retail', 'raj.manager', 'initech.example');
  const umbrella = await acc('Umbrella Health', 'Gold', 'Healthcare', 'raj.manager', 'umbrella.example');
  await q('INSERT INTO accounts(name,tier,industry,owner,email_domain,parent_id) VALUES ($1,$2,$3,$4,$5,$6)', ['Acme Logistics (subsidiary)', 'Platinum', 'Logistics', 'mia.manager', 'logistics.acme.example', acme]);
  for (const [a, n, e, ro] of [[acme, 'Wendy Wu', 'wendy@acme.example', 'IT Director'], [acme, 'Paul Park', 'paul@acme.example', 'Plant IT'], [globex, 'Gary Gold', 'gary@globex.example', 'Head of Infra'], [initech, 'Ingrid Lund', 'ingrid@initech.example', 'IT Manager'], [umbrella, 'Ursula Uno', 'ursula@umbrella.example', 'CIO']] as const)
    await q('INSERT INTO contacts(account_id,name,email,role) VALUES ($1,$2,$3,$4)', [a, n, e, ro]);

  const site = async (name: string, tier: string, lat: number, lon: number, account: number | null = null) =>
    (await one('INSERT INTO sites(name,dc_tier,lat,lon,account_id) VALUES ($1,$2,$3,$4,$5) RETURNING id', [name, tier, lat, lon, account])).id;
  const main = await site('Main DC - Frankfurt', 'MAIN', 50.11, 8.68);
  const east = await site('Sub DC - Warsaw', 'SUB', 52.23, 21.01);
  const west = await site('Sub DC - Madrid', 'SUB', 40.42, -3.7);
  const edge = await site('Sub DC - Dublin', 'SUB', 53.35, -6.26);

  const ci = async (cls: string, name: string, siteId: number, owner: number | null, o: any = {}) => {
    const r = await one(`INSERT INTO config_items(ci_class,name,serial,mac,hostname,site_id,owner_account_id,criticality,discovered_by,attributes)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'seed',$9) RETURNING id`, [cls, name, o.serial ?? `SN-${name}`, o.mac ?? null, o.hostname ?? name.toLowerCase(), siteId, owner, o.crit ?? 'Medium', { vendor: o.vendor, model: o.model, ...(o.attrs ?? {}) }]);
    await applyTemplate(r.id, cls);
    if (o.warranty != null) await q('INSERT INTO warranties(ci_id,vendor,support_level,start_date,end_date) VALUES ($1,$2,$3,$4,$5)', [r.id, o.vendor ?? 'Vendor', 'NBD 24x7', day(-700), day(o.warranty)]);
    return r.id as number;
  };
  const dep = (from: number, to: number, type = 'DEPENDS_ON', attrs: any = {}) => q('INSERT INTO ci_relationships(from_ci,to_ci,rel_type,attrs) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING', [from, to, type, attrs]);

  // Main DC (shared provider infrastructure has no single owner)
  const core = await ci('Router', 'CORE-RTR-01', main, null, { crit: 'Critical', vendor: 'Cisco', model: 'ASR 1001-X', warranty: 400 });
  const swA = await ci('Switch', 'SW-A1', main, null, { crit: 'Critical', vendor: 'Cisco', model: 'Nexus 9300', warranty: 25 });
  const swB = await ci('Switch', 'SW-A2', main, null, { crit: 'High', vendor: 'Cisco', model: 'Nexus 9300', warranty: 300 });
  const fw = await ci('Firewall', 'FW-EDGE-01', main, null, { crit: 'Critical', vendor: 'Palo Alto', model: 'PA-3410', warranty: 500 });
  await dep(swA, core, 'CONNECTS_TO', { port: 'Te1/0/1' }); await dep(swB, core, 'CONNECTS_TO', { port: 'Te1/0/2' }); await dep(core, fw, 'CONNECTS_TO');
  const acmeErp = await ci('Server', 'ACME-ERP-01', main, acme, { crit: 'Critical', vendor: 'Dell', model: 'R750', warranty: 200 });
  const acmeDb = await ci('Server', 'ACME-DB-01', main, acme, { crit: 'Critical', vendor: 'Dell', model: 'R750', warranty: 15 });
  const globexApp = await ci('Server', 'GLOBEX-APP-01', main, globex, { crit: 'High', vendor: 'HPE', model: 'DL380', warranty: 600 });
  const globexVm = await ci('VM', 'GLOBEX-VM-07', main, globex, { crit: 'Medium' });
  const umbrellaEhr = await ci('Server', 'UMBRELLA-EHR-01', main, umbrella, { crit: 'Critical', vendor: 'Lenovo', model: 'SR650', warranty: 120 });
  const initechPos = await ci('Server', 'INITECH-POS-01', main, initech, { crit: 'High', vendor: 'Dell', model: 'R650', warranty: -20 });
  await dep(acmeErp, swA, 'CONNECTS_TO', { port: 'Eth1/12' }); await dep(acmeDb, swA, 'CONNECTS_TO', { port: 'Eth1/13' });
  await dep(globexApp, swA, 'CONNECTS_TO', { port: 'Eth1/20' }); await dep(globexVm, globexApp, 'RUNS_ON');
  await dep(umbrellaEhr, swB, 'CONNECTS_TO', { port: 'Eth1/5' }); await dep(initechPos, swB, 'CONNECTS_TO', { port: 'Eth1/6' });
  await dep(acmeErp, acmeDb, 'DEPENDS_ON');

  // Sub DC Warsaw (Acme plant IoT + edge)
  const waSw = await ci('Switch', 'SW-WAW-E1', east, null, { crit: 'High', vendor: 'Juniper', model: 'EX4300', warranty: 250 });
  const waSrv = await ci('Server', 'ACME-MES-WAW', east, acme, { crit: 'High', vendor: 'Dell', model: 'R450', warranty: 365 });
  const waUps = await ci('UPS', 'UPS-WAW-01', east, null, { crit: 'High', vendor: 'APC', model: 'Smart-UPS', warranty: 180 });
  const waTemp = await ci('IoT', 'SENSOR-WAW-TEMP-01', east, acme, { crit: 'Medium', attrs: { interval_sec: 60 } });
  const waTemp2 = await ci('IoT', 'SENSOR-WAW-TEMP-02', east, acme, { crit: 'Medium', attrs: { interval_sec: 60 } });
  await dep(waSw, core, 'CONNECTS_TO', { wan: true }); await dep(waSrv, waSw, 'CONNECTS_TO'); await dep(waTemp, waSw, 'CONNECTS_TO'); await dep(waTemp2, waSw, 'CONNECTS_TO'); await dep(waSrv, waUps, 'POWERED_BY');
  // Sub DC Madrid (Globex)
  const maSw = await ci('Switch', 'SW-MAD-E1', west, null, { crit: 'High', vendor: 'Aruba', model: '6300', warranty: 330 });
  const maSrv = await ci('Server', 'GLOBEX-BR-MAD', west, globex, { crit: 'Medium', vendor: 'HPE', model: 'DL360', warranty: 90 });
  await dep(maSw, core, 'CONNECTS_TO', { wan: true }); await dep(maSrv, maSw, 'CONNECTS_TO');
  // Sub DC Dublin (Initech stores)
  const dbSw = await ci('Switch', 'SW-DUB-E1', edge, null, { crit: 'Medium', vendor: 'Cisco', model: 'C9200', warranty: 400 });
  const dbSrv = await ci('Server', 'INITECH-STORE-DUB', edge, initech, { crit: 'Medium', vendor: 'Dell', model: 'R350' });
  const dbEnd = await ci('Endpoint', 'INITECH-KIOSK-DUB', edge, initech, { crit: 'Low' });
  await dep(dbSw, core, 'CONNECTS_TO', { wan: true }); await dep(dbSrv, dbSw, 'CONNECTS_TO'); await dep(dbEnd, dbSw, 'CONNECTS_TO');

  // shared infrastructure -> customers (business impact)
  for (const [c, a] of [[core, acme], [core, globex], [core, umbrella], [core, initech], [swA, acme], [swA, globex], [swB, umbrella], [swB, initech], [waSw, acme], [maSw, globex], [dbSw, initech]] as const)
    await q('INSERT INTO ci_account_impact(ci_id,account_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [c, a]);

  // contracts and coverage (Initech's POS server is deliberately uncovered -> rule R4)
  const contract = async (account: number, name: string, policy: number, end: number, value: number, cis: number[]) => {
    const c = await one(`INSERT INTO contracts(account_id,name,sla_policy_id,start_date,end_date,value) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`, [account, name, policy, day(-300), day(end), value]);
    for (const x of cis) await q('INSERT INTO contract_covered_ci(contract_id,ci_id) VALUES ($1,$2)', [c.id, x]);
    return c.id;
  };
  await contract(acme, 'Acme Managed Infrastructure', platinum, 70, 480000, [acmeErp, acmeDb, waSrv, waTemp, waTemp2]);
  await contract(globex, 'Globex Hosting & Support', gold, 200, 260000, [globexApp, globexVm, maSrv]);
  await contract(umbrella, 'Umbrella EHR Hosting', gold, 40, 190000, [umbrellaEhr]);
  await contract(initech, 'Initech Store Support', silver, 150, 72000, [dbSrv, dbEnd]);

  // IPAM
  const sn = async (cidr: string, name: string, vlan: number, siteId: number) => (await one('INSERT INTO subnets(cidr,name,vlan,site_id) VALUES ($1,$2,$3,$4) RETURNING id', [cidr, name, vlan, siteId])).id;
  const s0 = await sn('10.0.0.0/24', 'Main DC servers', 100, main);
  const s1 = await sn(`10.${east}.1.0/24`, 'Warsaw edge', 110, east);
  const s2 = await sn(`10.${west}.1.0/24`, 'Madrid edge', 120, west);
  const s3 = await sn(`10.${edge}.1.0/24`, 'Dublin edge', 130, edge);
  const ip = (sub: number, a: string, c: number, mac: string) => q('INSERT INTO ip_addresses(subnet_id,ip,ci_id,mac) VALUES ($1,$2,$3,$4)', [sub, a, c, mac]);
  const mac = (n: number) => `00:1b:44:11:3a:${n.toString(16).padStart(2, '0')}`;
  let m = 1;
  for (const [sub, host, id] of [[s0, '10.0.0.1', core], [s0, '10.0.0.2', swA], [s0, '10.0.0.3', swB], [s0, '10.0.0.4', fw], [s0, '10.0.0.10', acmeErp], [s0, '10.0.0.11', acmeDb], [s0, '10.0.0.20', globexApp], [s0, '10.0.0.30', umbrellaEhr], [s0, '10.0.0.40', initechPos],
    [s1, `10.${east}.1.2`, waSw], [s1, `10.${east}.1.10`, waSrv], [s1, `10.${east}.1.5`, waUps], [s1, `10.${east}.1.21`, waTemp], [s1, `10.${east}.1.22`, waTemp2],
    [s2, `10.${west}.1.2`, maSw], [s2, `10.${west}.1.10`, maSrv], [s3, `10.${edge}.1.2`, dbSw], [s3, `10.${edge}.1.10`, dbSrv], [s3, `10.${edge}.1.30`, dbEnd]] as [number, string, number][])
    await ip(sub, host, id, mac(m++));

  // collectors, one per site
  for (const [sid, name] of [[main, 'collector-fra-01'], [east, 'collector-waw-01'], [west, 'collector-mad-01'], [edge, 'collector-dub-01']] as const)
    await q('INSERT INTO collectors(site_id,name,last_heartbeat) VALUES ($1,$2,now())', [sid, name]);
  // IoT devices report via MQTT, so they have no polled availability check; tune IoT thresholds
  await q(`UPDATE config_items SET last_seen=now() WHERE ci_class='IoT'`);

  await q('INSERT INTO queues(name) VALUES ($1),($2),($3),($4),($5)', ['Service Desk', 'Network Ops', 'Systems', 'IoT Ops', 'Triage']);
  const kb = [
    ['Switch port flapping: triage steps', 'Check SFP/DAC, review interface errors, move to spare port, schedule cable replacement.', ['switch', 'network']],
    ['Server high CPU: first response', 'Identify top process, check recent deployments, scale or throttle, open a problem record if recurring.', ['server', 'cpu']],
    ['Disk space low on database host', 'Rotate logs, vacuum, expand volume. Escalate to DBA if growth exceeds 5%/day.', ['server', 'disk']],
    ['UPS on battery: what to do', 'Confirm mains failure, check runtime, notify site contact, prepare graceful shutdown if < 10 min.', ['ups', 'power']],
    ['Temperature sensor over threshold', 'Verify CRAC status, check airflow, dispatch facilities if > 35C for 10 min.', ['iot', 'temperature']],
  ];
  for (const [t, b, tags] of kb as any) await q('INSERT INTO kb_articles(title,body,tags) VALUES ($1,$2,$3)', [t, b, tags]);

  for (const [a, n, st, amt, cd] of [[acme, 'Plant 3 expansion - managed edge', 'Proposal', 120000, 45], [globex, 'DR site hosting add-on', 'Negotiation', 85000, 30], [umbrella, 'Contract renewal FY27', 'Qualified', 190000, 40], [initech, 'Store network refresh', 'Prospect', 40000, 90]] as const)
    await q('INSERT INTO opportunities(account_id,name,stage,amount,close_date,source) VALUES ($1,$2,$3,$4,$5,$6)', [a, n, st, amt, day(cd), 'manual']);

  await q(`INSERT INTO ci_account_impact(ci_id,account_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [waSw, acme]);
  // seed baseline history so charts are populated at first launch
  const now = Date.now();
  const checks = await q('SELECT ci_id, metric FROM checks');
  const base: any = { cpu: 30, mem: 55, disk: 60, bandwidth: 35, temperature: 24, battery: 87, availability: 1, service: 1 };
  for (const c of checks) {
    if (c.metric === 'availability' || c.metric === 'service') continue;
    for (let i = 60; i >= 1; i--) {
      const v = base[c.metric] + Math.sin(i / 7 + c.ci_id) * 6 + (((i * 31 + c.ci_id * 17) % 7) - 3);
      await q(`INSERT INTO metrics(time,ci_id,metric,avg,min,max,p95,samples) VALUES (date_trunc('minute',$1::timestamptz),$2,$3,$4,$5,$6,$7,6) ON CONFLICT DO NOTHING`, [new Date(now - i * 60000), c.ci_id, c.metric, v, v - 3, v + 3, v + 2]);
    }
  }
  for (const c of await q(`SELECT id FROM config_items WHERE ci_class IN ('IoT')`)) {
    await q('INSERT INTO iot_telemetry(time,ci_id,topic,value) VALUES (now(),$1,$2,23.5)', [c.id, `plant/${c.id}/temperature`]);
  }
  return { acme, globex, umbrella, initech, core, swA, swB, fw, acmeErp, acmeDb, globexApp, globexVm, umbrellaEhr, waSw, waSrv, waUps, waTemp, waTemp2, maSw, maSrv, dbSw, dbSrv, dbEnd, initechPos, main, east, west, edge };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { timescale } = await resetDb();
  await seed();
  console.log(`seeded (timescaledb=${timescale})`);
  await pool.end();
}
