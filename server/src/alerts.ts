import { q, one } from './db.ts';
import { bus, publish } from './events.ts';
import * as hd from './helpdesk.ts';
import * as cmdb from './cmdb.ts';
import { resolveContract } from './slaService.ts';

export const RULES = [
  { code: 'R1', name: 'Critical device down -> P1 ticket', description: 'Critical alert on a High/Critical-criticality CI creates a P1 incident, pages on-call, notifies the account manager.', params: {} },
  { code: 'R2', name: 'Warning threshold -> P3 ticket (persistent)', description: 'Warning (or critical on low-criticality CI) opens a ticket only if it persists beyond persist_min.', params: { persist_min: 15 } },
  { code: 'R3', name: 'Alert storm / topology parent -> one ticket', description: 'Alerts whose upstream CI is DOWN attach to the parent incident. N alerts at a site within window_min open one major incident.', params: { storm_threshold: 5, window_min: 5 } },
  { code: 'R4', name: 'Uncovered asset alert', description: 'Alert on a CI with no active contract coverage creates a P4 ticket and a CRM upsell opportunity.', params: {} },
  { code: 'R5', name: 'Duplicate suppression', description: 'Open alert-sourced ticket for the same CI absorbs repeats instead of creating another.', params: {} },
  { code: 'R6', name: 'Auto-resolve on recovery', description: 'When the alert clears and no agent has replied within quiet_min, resolve the ticket; reopen if it recurs within 24h.', params: { quiet_min: 30 } },
  { code: 'R7', name: 'Response SLA warning', description: 'At 75%/90% of a target, notify the queue lead.', params: {} },
  { code: 'R8', name: 'Resolution SLA breach L1', description: 'Breach escalates to Team Lead and tags the ticket.', params: {} },
  { code: 'R9', name: 'SLA breach L2/L3 escalation', description: 'P1/P2 breached tickets escalate to Incident Manager, then Service Director + Account Executive.', params: {} },
  { code: 'R11', name: 'Pause on customer wait', description: 'Waiting on Customer / On Hold pauses SLA timers; resumes on reply.', params: { auto_close_days: 5 } },
  { code: 'R12', name: 'Maintenance window suppression', description: 'Alerts on CIs inside a window are recorded but suppressed; SLA optionally paused.', params: {} },
  { code: 'R13', name: 'Warranty expiring', description: 'Warranty ending within warn_days creates a CRM renewal opportunity for the account manager.', params: { warn_days: 90 } },
  { code: 'R14', name: 'Contract renewal risk', description: 'Contract ending within 90 days with health score below min_health or SLA breaches flags the account manager.', params: { min_health: 70 } },
  { code: 'R15', name: 'New device discovered', description: 'Unknown device creates a CI in Pending Review and applies the monitor template.', params: {} },
  { code: 'R16', name: 'Rogue / unknown device', description: 'Unknown MAC in a managed subnet raises a security ticket.', params: {} },
  { code: 'R17', name: 'IP conflict', description: 'Two MACs observed on one IP creates an incident for the network team.', params: {} },
  { code: 'R18', name: 'Auto-remediation runbook', description: 'Stopped-service alerts trigger a restart runbook, verified and annotated on the ticket.', params: { enabled_metrics: ['service'] } },
  { code: 'R19', name: 'CSAT follow-up', description: 'CSAT <= 2 creates a follow-up task for the service manager.', params: {} },
  { code: 'R20', name: 'Collector offline', description: 'Missed heartbeats raise a collector incident and mark site CIs UNKNOWN (not DOWN).', params: { missed_beats: 3 } },
];

export async function seedRules() {
  for (const r of RULES)
    await q(`INSERT INTO workflow_rules(code,name,description,params) VALUES ($1,$2,$3,$4) ON CONFLICT (code) DO NOTHING`, [r.code, r.name, r.description, r.params]);
}
async function rule(code: string) {
  const r = await one('SELECT * FROM workflow_rules WHERE code=$1', [code]);
  return r?.enabled ? r : undefined;
}
async function exec(code: string, trigger: string, subject: string, outcome: string) {
  await q('INSERT INTO workflow_executions(rule_code,trigger,subject,outcome) VALUES ($1,$2,$3,$4)', [code, trigger, subject, outcome]);
  publish('workflow.executed', { rule: code, trigger, subject, outcome });
}

export async function notify(channel: string, recipient: string, subject: string, body = '', ref = '') {
  await q('INSERT INTO notifications(channel,recipient,subject,body,ref) VALUES ($1,$2,$3,$4,$5)', [channel, recipient, subject, body, ref]);
  publish('notification', { channel, recipient, subject, ref });
}

// ---- notification fan-out for SLA events (R7-R9) ------------------------------------------------
export function wireNotifications() {
  bus.on('sla.warning', async (e) => { if (await rule('R7')) { await notify('email', 'queue.lead', `SLA ${e.pct}% - ${e.number}`, `${e.kind} target`, e.number); await exec('R7', 'sla.warning', e.number, `notified queue lead at ${e.pct}%`); } });
  bus.on('sla.breached', async (e) => { if (await rule('R8')) { await notify('email', 'team.lead', `SLA BREACH - ${e.number}`, e.kind, e.number); await exec('R8', 'sla.breached', e.number, 'escalated L1 to Team Lead'); } });
  bus.on('sla.escalated', async (e) => { if (await rule('R9')) { await notify(e.level === 3 ? 'voice' : 'sms', e.notify, `ESCALATION L${e.level} - ${e.number}`, '', e.number); await exec('R9', 'sla.escalated', e.number, `level ${e.level}: ${e.notify}`); } });
  bus.on('ticket.csat', async (e) => {
    if (e.score <= 2 && await rule('R19')) {
      const t = await one('SELECT * FROM tickets WHERE id=$1', [e.ticket_id]);
      await hd.createTicket({ subject: `CSAT follow-up for ${t.number}`, type: 'Task', priority: 'P3', channel: 'workflow', account_id: t.account_id, queue: 'Service Desk', parent_ticket_id: t.id });
      await exec('R19', 'ticket.csat', t.number, 'follow-up task created');
    }
  });
}

// ---- alert lifecycle ------------------------------------------------------------------------------
export interface AlertInput { ci_id: number; metric: string; severity: 'critical' | 'warning' | 'info'; message?: string; value?: number }

export async function raiseAlert(a: AlertInput, now = new Date()) {
  const fp = `${a.ci_id}:${a.metric}`;
  const ci = await one('SELECT * FROM config_items WHERE id=$1', [a.ci_id]);
  if (!ci || ['Retired', 'Disposed'].includes(ci.lifecycle)) return undefined;
  const existing = await one(`SELECT * FROM alerts WHERE fingerprint=$1 AND state<>'closed'`, [fp]);
  if (existing) {
    const sev = a.severity === 'critical' ? 'critical' : existing.severity;
    await q('UPDATE alerts SET last_seen=$2, repeat_count=repeat_count+1, severity=$3, value=$4, message=COALESCE($5,message) WHERE id=$1', [existing.id, now, sev, a.value ?? null, a.message ?? null]);
    if (existing.ticket_id && await rule('R5')) {
      await q('UPDATE tickets SET repeat_count=repeat_count+1 WHERE id=$1', [existing.ticket_id]);
    }
    if (sev !== existing.severity) { publish('alert.updated', { ...existing, severity: sev }); await onAlertOpened({ ...existing, severity: sev }, now); }
    return existing.id as number;
  }
  const maint = await one(`SELECT id FROM maintenance_windows WHERE suppress_alerts AND $2 BETWEEN start_at AND end_at AND (ci_id=$1 OR site_id=$3)`, [a.ci_id, now, ci.site_id]);
  const ups = await cmdb.upstream(a.ci_id);
  const rootRow = ups.length ? await one(`SELECT id FROM config_items WHERE id = ANY($1) AND state='DOWN' ORDER BY id LIMIT 1`, [ups.map((u) => u.id)]) : undefined;
  const suppressed = !!maint;
  const row = await one(`INSERT INTO alerts(ci_id,metric,severity,fingerprint,message,value,suppressed,root_cause_ci,first_seen,last_seen)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$9) RETURNING *`,
    [a.ci_id, a.metric, a.severity, fp, a.message ?? `${a.metric} ${a.severity}`, a.value ?? null, suppressed, rootRow?.id ?? null, now]);
  await cmdb.recomputeState(a.ci_id);
  const full = { ...row, ci_name: ci.name, ci_class: ci.ci_class, site_id: ci.site_id, account_id: ci.owner_account_id };
  publish('alert.opened', full);
  if (suppressed) { if (await rule('R12')) await exec('R12', 'alert.opened', `${ci.name}/${a.metric}`, 'suppressed - maintenance window'); return row.id as number; }
  await onAlertOpened(row, now);
  return row.id as number;
}

async function attachToTicket(alertId: number, ticketId: number) {
  await q('UPDATE alerts SET ticket_id=$2 WHERE id=$1', [alertId, ticketId]);
}

/** The Alert -> Ticket -> SLA pipeline (R1-R5, R18). */
export async function onAlertOpened(al: any, now = new Date()) {
  const ci = await one('SELECT * FROM config_items WHERE id=$1', [al.ci_id]);
  const label = `${ci.name}: ${al.message ?? al.metric}`;
  const fresh = await one('SELECT * FROM alerts WHERE id=$1', [al.id]);
  if (fresh?.ticket_id) return;

  // R3a: topology parent is down -> attach to the root-cause incident instead of opening a new ticket
  if (al.root_cause_ci && await rule('R3')) {
    const parent = await one(`SELECT ticket_id FROM alerts WHERE ci_id=$1 AND state<>'closed' AND ticket_id IS NOT NULL ORDER BY id LIMIT 1`, [al.root_cause_ci]);
    if (parent) {
      await attachToTicket(al.id, parent.ticket_id);
      await hd.addEvent(parent.ticket_id, 'alert_linked', 'system', `Downstream alert linked: ${label}`);
      await exec('R3', 'alert.opened', label, `attached to root-cause ticket (upstream CI ${al.root_cause_ci} DOWN)`);
      return;
    }
  }
  // R12-like: if parent not ticketed yet, still suppress downstream noise
  if (al.root_cause_ci) { await exec('R3', 'alert.opened', label, 'suppressed - upstream CI DOWN'); return; }

  // R5: an open alert-sourced ticket for this CI absorbs it
  if (await rule('R5')) {
    const dup = await one(`SELECT id FROM tickets WHERE ci_id=$1 AND channel='alert' AND status NOT IN ('Resolved','Closed') ORDER BY id DESC LIMIT 1`, [al.ci_id]);
    if (dup) {
      await attachToTicket(al.id, dup.id);
      await q('UPDATE tickets SET repeat_count=repeat_count+1 WHERE id=$1', [dup.id]);
      await hd.addEvent(dup.id, 'alert_linked', 'system', `Related alert appended: ${label}`);
      await exec('R5', 'alert.opened', label, `appended to ticket ${dup.id}`);
      return;
    }
    // reopen a recently auto-resolved ticket (R6 recurrence within 24h)
    const rec = await one(`SELECT t.id FROM tickets t WHERE t.ci_id=$1 AND t.channel='alert' AND t.status='Resolved' AND t.resolved_at > $2
      AND EXISTS (SELECT 1 FROM ticket_events e WHERE e.ticket_id=t.id AND e.type='auto_resolve') ORDER BY t.id DESC LIMIT 1`, [al.ci_id, new Date(now.getTime() - 86400000)]);
    if (rec) {
      await hd.addEvent(rec.id, 'note', 'system', `Alert recurred: ${label} - reopening`);
      await hd.setStatus(rec.id, 'Open', 'system', now);
      await attachToTicket(al.id, rec.id);
      await exec('R6', 'alert.opened', label, `reopened ticket ${rec.id}`);
      return;
    }
  }

  // R3b: alert storm at a site -> single major incident
  const r3 = await rule('R3');
  if (r3 && ci.site_id) {
    const p = r3.params;
    const major = await one(`SELECT id FROM tickets WHERE type='Major Incident' AND channel='alert' AND status NOT IN ('Resolved','Closed') AND description LIKE $1 ORDER BY id DESC LIMIT 1`, [`%[site:${ci.site_id}]%`]);
    if (major) {
      await attachToTicket(al.id, major.id);
      await hd.addEvent(major.id, 'alert_linked', 'system', `Storm member: ${label}`);
      await exec('R3', 'alert.opened', label, `attached to major incident ${major.id}`);
      return;
    }
    const storm = await q(`SELECT a.id, a.ticket_id FROM alerts a JOIN config_items c ON c.id=a.ci_id WHERE a.state<>'closed' AND NOT a.suppressed AND a.first_seen > $2 AND c.site_id=$1`,
      [ci.site_id, new Date(now.getTime() - p.window_min * 60000)]);
    if (storm.length >= p.storm_threshold && new Set(storm.map((s: any) => s.id)).size >= p.storm_threshold) {
      const site = await one('SELECT name FROM sites WHERE id=$1', [ci.site_id]);
      const mt = await hd.createTicket({ subject: `Major incident: alert storm at ${site.name}`, description: `${storm.length} concurrent alerts. [site:${ci.site_id}]`, type: 'Major Incident', priority: 'P1', channel: 'alert', ci_id: al.ci_id, source_alert_id: al.id, queue: 'Network Ops' }, now);
      const kids = storm.map((s: any) => s.ticket_id).filter(Boolean);
      if (kids.length) await q('UPDATE tickets SET parent_ticket_id=$1 WHERE id = ANY($2) AND parent_ticket_id IS NULL AND id<>$1', [mt.id, kids]);
      await attachToTicket(al.id, mt.id);
      await notify('sms', 'incident.manager', `MAJOR INCIDENT ${mt.number}`, site.name, mt.number);
      await exec('R3', 'alert.opened', site.name, `storm of ${storm.length} alerts -> major incident ${mt.number}; ${kids.length} tickets linked`);
      return;
    }
  }

  // Decide priority
  const crit = ['High', 'Critical'].includes(ci.criticality);
  let priority: string | undefined, ruleCode = '';
  if (al.severity === 'critical' && crit && await rule('R1')) { priority = 'P1'; ruleCode = 'R1'; }
  else if (al.severity === 'critical') { priority = 'P2'; ruleCode = 'R1'; }
  else if (al.severity === 'warning') return; // R2: deferred - see deferredAlertTickets()
  else return;

  // R4: uncovered asset
  const contract = await resolveContract(ci.owner_account_id, ci.id);
  if (ci.owner_account_id && !contract?.covered && await rule('R4')) {
    const t = await hd.createTicket({ subject: `[Uncovered asset] ${label}`, description: 'No active contract covers this asset.', priority: 'P4', channel: 'alert', ci_id: ci.id, source_alert_id: al.id }, now);
    await attachToTicket(al.id, t.id);
    await q(`INSERT INTO opportunities(account_id,name,stage,amount,source) VALUES ($1,$2,'Prospect',0,'Uncovered asset alert')`, [ci.owner_account_id, `Add support coverage: ${ci.name}`]);
    await q(`INSERT INTO activities(account_id,kind,note,actor) VALUES ($1,'upsell',$2,'workflow')`, [ci.owner_account_id, `Alert on uncovered asset ${ci.name}`]);
    await exec('R4', 'alert.opened', label, `P4 ticket ${t.number} + CRM opportunity`);
    return;
  }
  await openIncidentFor(al, ci, priority!, label, ruleCode, now);
}

/** Creates the incident; for shared infrastructure fans out one SLA-bound child per impacted account. */
async function openIncidentFor(al: any, ci: any, priority: string, label: string, ruleCode: string, now: Date) {
  const imp = await cmdb.impact(ci.id);
  const accounts = imp.accounts as any[];
  const shared = !ci.owner_account_id && accounts.length > 0;
  const main = await hd.createTicket({ subject: label, description: `Auto-generated from monitoring (${al.metric}=${al.value ?? 'n/a'}).`, priority, channel: 'alert', ci_id: ci.id, source_alert_id: al.id, account_id: shared ? null : ci.owner_account_id, queue: hd.queueForClass(ci.ci_class) }, now);
  await attachToTicket(al.id, main.id);
  await q('UPDATE alerts SET ticket_id=$2 WHERE ci_id IN (SELECT id FROM config_items WHERE id=$1) AND id=$3', [ci.id, main.id, al.id]);
  if (shared || accounts.length > 1) {
    for (const acc of accounts.filter((a) => a.id !== ci.owner_account_id)) {
      const child = await hd.createTicket({ subject: `[Impact] ${label}`, description: `Customer impact of ${ci.name}. Parent ${main.number}.`, priority, channel: 'alert', ci_id: ci.id, account_id: acc.id, parent_ticket_id: main.id, queue: 'Service Desk' }, now);
      await hd.addEvent(main.id, 'impact', 'system', `Impacted account ${acc.name} -> ${child.number}`);
      const am = (await one('SELECT owner FROM accounts WHERE id=$1', [acc.id]))?.owner ?? 'account.manager';
      await notify('email', am, `Customer impact: ${label}`, acc.name, child.number);
    }
  }
  if (ci.owner_account_id) {
    const am = (await one('SELECT owner FROM accounts WHERE id=$1', [ci.owner_account_id]))?.owner ?? 'account.manager';
    if (priority === 'P1') await notify('email', am, `P1 for your account: ${label}`, '', main.number);
  }
  if (priority === 'P1') await notify('pager', 'on-call', `P1 ${main.number}`, label, main.number);
  await hd.updateHealthScore(ci.owner_account_id);
  await exec(ruleCode, 'alert.opened', label, `${priority} ticket ${main.number}${shared ? ` + ${accounts.length} impact tickets` : ''}`);
  await runbook(al, ci, main.id, now);
}

/** R18: auto-remediation. The restart is executed through the registered executor (agent/WinRM/SSH in production). */
type Executor = (ciId: number, metric: string) => Promise<boolean>;
let executor: Executor = async () => false;
export function setRunbookExecutor(fn: Executor) { executor = fn; }
async function runbook(al: any, ci: any, ticketId: number, now: Date) {
  const r = await rule('R18');
  if (!r || !(r.params.enabled_metrics ?? []).some((m: string) => al.metric.startsWith(m))) return;
  const ok = await executor(ci.id, al.metric);
  await hd.addEvent(ticketId, 'runbook', 'runbook:restart-service', ok ? `Restart executed and verified for ${al.metric}` : 'Restart executed; verification failed - manual follow-up required');
  await exec('R18', 'alert.opened', `${ci.name}/${al.metric}`, ok ? 'restarted + verified' : 'failed');
}

/** R2: warnings that persist beyond `persist_min` become P3 tickets. Called by the scheduler. */
export async function deferredAlertTickets(now = new Date()) {
  const r = await rule('R2');
  if (!r) return 0;
  const rows = await q(`SELECT a.* FROM alerts a WHERE a.state<>'closed' AND NOT a.suppressed AND a.ticket_id IS NULL AND a.root_cause_ci IS NULL
    AND a.severity='warning' AND a.first_seen <= $1`, [new Date(now.getTime() - r.params.persist_min * 60000)]);
  let n = 0;
  for (const al of rows) {
    const ci = await one('SELECT * FROM config_items WHERE id=$1', [al.ci_id]);
    const dup = await one(`SELECT id FROM tickets WHERE ci_id=$1 AND channel='alert' AND status NOT IN ('Resolved','Closed') LIMIT 1`, [al.ci_id]);
    if (dup) { await attachToTicket(al.id, dup.id); continue; }
    const t = await hd.createTicket({ subject: `${ci.name}: ${al.message}`, description: `Persistent warning (${al.metric}).`, priority: 'P3', channel: 'alert', ci_id: ci.id, source_alert_id: al.id }, now);
    await attachToTicket(al.id, t.id);
    await exec('R2', 'alert.persisted', ci.name, `P3 ticket ${t.number}`);
    n++;
  }
  return n;
}

export async function ackAlert(id: number, actor: string) {
  const a = await one(`UPDATE alerts SET state='acked', acked_by=$2 WHERE id=$1 AND state='open' RETURNING *`, [id, actor]);
  if (a) publish('alert.updated', a);
  return a;
}

export async function closeAlert(ciId: number, metric: string, now = new Date(), by = 'recovery') {
  const a = await one(`UPDATE alerts SET state='closed', closed_at=$2 WHERE fingerprint=$1 AND state<>'closed' RETURNING *`, [`${ciId}:${metric}`, now]);
  if (!a) return undefined;
  await cmdb.recomputeState(ciId);
  publish('alert.closed', a);
  // R6 auto-resolve
  const r = await rule('R6');
  if (a.ticket_id && r) {
    const open = await one(`SELECT count(*)::int n FROM alerts WHERE ticket_id=$1 AND state<>'closed'`, [a.ticket_id]);
    const t = await one('SELECT * FROM tickets WHERE id=$1', [a.ticket_id]);
    if (open.n === 0 && t && !['Resolved', 'Closed'].includes(t.status) && t.channel === 'alert') {
      const agent = await one(`SELECT max(at) at FROM ticket_events WHERE ticket_id=$1 AND type IN ('agent_reply','note') AND actor<>'system'`, [t.id]);
      const quiet = !agent?.at || (now.getTime() - new Date(agent.at).getTime()) / 60000 >= r.params.quiet_min;
      if (quiet) {
        await hd.addEvent(t.id, 'auto_resolve', 'system', 'Alert cleared - auto-resolved');
        await hd.setStatus(t.id, 'Resolved', 'system', now);
        await exec('R6', 'alert.closed', t.number, 'auto-resolved');
      } else {
        await hd.addEvent(t.id, 'note', 'system', 'Alert cleared - pending agent verification');
        await exec('R6', 'alert.closed', t.number, 'recovery noted; agent active so left open');
      }
    }
  }
  return a;
}

// ---- scheduled business rules ------------------------------------------------------------------------
export async function warrantyScan(now = new Date()) {
  const r = await rule('R13');
  if (!r) return 0;
  const rows = await q(`SELECT w.*, c.name ci_name, c.owner_account_id FROM warranties w JOIN config_items c ON c.id=w.ci_id
    WHERE NOT w.renewal_flagged AND w.end_date <= ($1::date + $2::int)`, [now, r.params.warn_days]);
  for (const w of rows) {
    await q('UPDATE warranties SET renewal_flagged=true WHERE id=$1', [w.id]);
    if (w.owner_account_id) {
      await q(`INSERT INTO opportunities(account_id,name,stage,amount,close_date,source) VALUES ($1,$2,'Prospect',0,$3,'Warranty expiry')`, [w.owner_account_id, `Warranty renewal: ${w.ci_name}`, w.end_date]);
      await q(`INSERT INTO activities(account_id,kind,note,actor) VALUES ($1,'task',$2,'workflow')`, [w.owner_account_id, `Warranty for ${w.ci_name} ends ${new Date(w.end_date).toISOString().slice(0, 10)}`]);
    }
    await exec('R13', 'scheduler', w.ci_name, 'renewal opportunity created');
  }
  return rows.length;
}

export async function renewalRiskScan(now = new Date()) {
  const r = await rule('R14');
  if (!r) return 0;
  const rows = await q(`SELECT c.*, a.name account_name, a.health_score, a.owner,
      (SELECT count(*)::int FROM tickets t WHERE t.account_id=a.id AND t.sla_breached AND t.created_at > now()-interval '90 days') breaches
    FROM contracts c JOIN accounts a ON a.id=c.account_id WHERE c.status='active' AND c.end_date <= ($1::date + 90)`, [now]);
  let n = 0;
  for (const c of rows) {
    if (c.health_score < r.params.min_health || c.breaches >= 2) {
      const dup = await one(`SELECT 1 x FROM activities WHERE account_id=$1 AND kind='renewal_risk' AND at > now()-interval '30 days'`, [c.account_id]);
      if (dup) continue;
      await q(`INSERT INTO activities(account_id,kind,note,actor) VALUES ($1,'renewal_risk',$2,'workflow')`, [c.account_id, `${c.name} ends ${new Date(c.end_date).toISOString().slice(0, 10)}; health ${c.health_score}, ${c.breaches} SLA breaches`]);
      await notify('email', c.owner ?? 'account.manager', `Renewal risk: ${c.account_name}`, c.name);
      await exec('R14', 'scheduler', c.account_name, 'renewal-risk flagged'); n++;
    }
  }
  return n;
}
