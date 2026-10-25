import { q, one, audit } from './db.ts';
import { publish } from './events.ts';
import * as sla from './slaService.ts';

export const STATUSES = ['New', 'Open', 'Waiting on Customer', 'On Hold', 'Resolved', 'Closed'] as const;
const PAUSING = new Set(['Waiting on Customer', 'On Hold']);
export const AGENTS: Record<string, string[]> = {
  'Service Desk': ['alice.agent', 'bob.agent'],
  'Network Ops': ['nina.network', 'omar.network'],
  Systems: ['sam.sysadmin', 'sara.sysadmin'],
  'IoT Ops': ['ivan.iot'],
  Triage: ['alice.agent'],
};

export function queueForClass(ciClass?: string | null) {
  if (!ciClass) return 'Service Desk';
  if (['Switch', 'Router', 'Firewall', 'AccessPoint'].includes(ciClass)) return 'Network Ops';
  if (['Server', 'VM', 'Storage'].includes(ciClass)) return 'Systems';
  if (['IoT', 'Sensor', 'UPS'].includes(ciClass)) return 'IoT Ops';
  return 'Service Desk';
}

async function leastLoaded(queue: string) {
  const agents = AGENTS[queue] ?? AGENTS['Service Desk'];
  const rows = await q(`SELECT assignee, count(*)::int n FROM tickets WHERE status NOT IN ('Resolved','Closed') AND assignee = ANY($1) GROUP BY assignee`, [agents]);
  const load = new Map(rows.map((r: any) => [r.assignee, r.n]));
  return [...agents].sort((a, b) => (load.get(a) ?? 0) - (load.get(b) ?? 0))[0];
}

export interface NewTicket {
  subject: string; description?: string; type?: string; priority?: string; channel?: string;
  account_id?: number | null; contact_id?: number | null; ci_id?: number | null; source_alert_id?: number | null;
  queue?: string; actor?: string; parent_ticket_id?: number | null;
}

export async function createTicket(input: NewTicket, now = new Date()) {
  let { account_id = null, ci_id = null } = input;
  const ci = ci_id ? await one('SELECT * FROM config_items WHERE id=$1', [ci_id]) : undefined;
  if (!account_id && ci?.owner_account_id) account_id = ci.owner_account_id;
  const queue = input.queue ?? (account_id || ci ? queueForClass(ci?.ci_class) : 'Triage');
  const assignee = input.channel === 'alert' || input.priority === 'P1' || input.priority === 'P2' ? await leastLoaded(queue) : null;
  const row = await one(
    `INSERT INTO tickets(number,account_id,contact_id,ci_id,subject,description,type,priority,status,channel,queue,assignee,source_alert_id,parent_ticket_id,created_at,updated_at)
     VALUES ('TMP',$1,$2,$3,$4,$5,$6,$7,'New',$8,$9,$10,$11,$12,$13,$13) RETURNING id`,
    [account_id, input.contact_id ?? null, ci_id, input.subject, input.description ?? '', input.type ?? 'Incident',
     input.priority ?? 'P3', input.channel ?? 'portal', queue, assignee, input.source_alert_id ?? null, input.parent_ticket_id ?? null, now]);
  const id = row.id as number;
  const number = `INC-${String(id).padStart(6, '0')}`;
  await q('UPDATE tickets SET number=$2 WHERE id=$1', [id, number]);
  await q(`INSERT INTO ticket_events(ticket_id,type,actor,body,payload) VALUES ($1,'created',$2,$3,$4)`,
    [id, input.actor ?? input.channel ?? 'system', `Ticket created via ${input.channel ?? 'portal'}`, { priority: input.priority ?? 'P3' }]);
  await sla.startTimers(id, now);
  await audit(input.actor ?? 'system', 'create', 'ticket', id);
  const t = await getTicket(id);
  publish('ticket.created', t);
  return t;
}

export async function getTicket(id: number) {
  const t = await one(`SELECT t.*, a.name account_name, a.tier account_tier, c.name contact_name, c.email contact_email,
      ci.name ci_name, ci.ci_class, ci.criticality ci_criticality, ct.name contract_name
    FROM tickets t LEFT JOIN accounts a ON a.id=t.account_id LEFT JOIN contacts c ON c.id=t.contact_id
    LEFT JOIN config_items ci ON ci.id=t.ci_id LEFT JOIN contracts ct ON ct.id=t.contract_id WHERE t.id=$1`, [id]);
  if (!t) return undefined;
  t.timers = await q('SELECT * FROM sla_timers WHERE ticket_id=$1 ORDER BY kind DESC', [id]);
  return t;
}

export async function ticketEvents(id: number) {
  return q('SELECT * FROM ticket_events WHERE ticket_id=$1 ORDER BY at, id', [id]);
}

export async function addEvent(id: number, type: string, actor: string, body: string, payload: any = {}) {
  await q('INSERT INTO ticket_events(ticket_id,type,actor,body,payload) VALUES ($1,$2,$3,$4,$5)', [id, type, actor, body, payload]);
  await q('UPDATE tickets SET updated_at=now() WHERE id=$1', [id]);
}

/** Agent public reply / customer reply / internal note. */
export async function reply(id: number, who: 'agent' | 'customer' | 'note', actor: string, body: string, now = new Date()) {
  const t = await one('SELECT * FROM tickets WHERE id=$1', [id]);
  if (!t) throw new Error('ticket not found');
  await addEvent(id, who === 'note' ? 'note' : `${who}_reply`, actor, body);
  if (who === 'agent') {
    await sla.markMet(id, 'response', now);
    if (t.status === 'New') await setStatus(id, 'Open', actor, now);
  }
  if (who === 'customer' && PAUSING.has(t.status)) await setStatus(id, 'Open', 'customer', now);
  if (who === 'customer' && t.status === 'Resolved') await setStatus(id, 'Open', 'customer', now); // reopen
  publish('ticket.updated', await getTicket(id));
}

export async function setStatus(id: number, status: string, actor = 'system', now = new Date()) {
  if (!STATUSES.includes(status as any)) throw new Error(`invalid status ${status}`);
  const t = await one('SELECT * FROM tickets WHERE id=$1', [id]);
  if (!t) throw new Error('ticket not found');
  if (t.status === status) return getTicket(id);
  await q(`UPDATE tickets SET status=$2, updated_at=$3, resolved_at=CASE WHEN $2 IN ('Resolved','Closed') THEN COALESCE(resolved_at,$3) WHEN $2='Open' THEN NULL ELSE resolved_at END WHERE id=$1`, [id, status, now]);
  await addEvent(id, 'status', actor, `${t.status} -> ${status}`);
  if (PAUSING.has(status)) await sla.pauseTimers(id, now);
  else if (PAUSING.has(t.status)) await sla.resumeTimers(id, now);
  if (status === 'Open' && actor !== 'customer' && actor !== 'system') await sla.markMet(id, 'response', now);
  if (status === 'Resolved' || status === 'Closed') {
    await sla.markMet(id, 'response', now); // a resolved ticket cannot still be awaiting a first response
    await sla.markMet(id, 'resolution', now);
    publish('ticket.closed', await getTicket(id));
    await updateHealthScore(t.account_id);
  }
  const out = await getTicket(id);
  publish('ticket.updated', out);
  return out;
}

export async function setPriority(id: number, priority: string, actor = 'system') {
  await q('UPDATE tickets SET priority=$2, updated_at=now() WHERE id=$1', [id, priority]);
  await addEvent(id, 'priority', actor, `Priority set to ${priority}`);
  await sla.recomputeTimers(id);
  const t = await getTicket(id);
  publish('ticket.updated', t);
  return t;
}

export async function assign(id: number, assignee: string, queue?: string, actor = 'system') {
  await q('UPDATE tickets SET assignee=$2, queue=COALESCE($3,queue), updated_at=now() WHERE id=$1', [id, assignee, queue ?? null]);
  await addEvent(id, 'assign', actor, `Assigned to ${assignee}${queue ? ` (${queue})` : ''}`);
  const t = await getTicket(id);
  publish('ticket.updated', t);
  return t;
}

export async function mergeTickets(sourceId: number, targetId: number, actor: string) {
  await addEvent(targetId, 'merge', actor, `Merged ticket #${sourceId}`);
  await q(`UPDATE tickets SET parent_ticket_id=$2 WHERE id=$1`, [sourceId, targetId]);
  await setStatus(sourceId, 'Closed', actor);
  return getTicket(targetId);
}

export async function submitCsat(id: number, score: number) {
  await q('UPDATE tickets SET csat=$2 WHERE id=$1', [id, score]);
  const t = await one('SELECT * FROM tickets WHERE id=$1', [id]);
  await addEvent(id, 'csat', 'customer', `CSAT ${score}/5`);
  await updateHealthScore(t.account_id);
  publish('ticket.csat', { ticket_id: id, score });
  return t;
}

/** Account health: starts at 100, penalised by open P1/P2, SLA breaches (30d), low CSAT, and active critical alerts. */
export async function updateHealthScore(accountId: number | null) {
  if (!accountId) return;
  const m = await one(`SELECT
    (SELECT count(*) FROM tickets WHERE account_id=$1 AND status NOT IN ('Resolved','Closed') AND priority IN ('P1','P2'))::int open_hi,
    (SELECT count(*) FROM tickets WHERE account_id=$1 AND sla_breached AND created_at > now()-interval '30 days')::int breaches,
    (SELECT count(*) FROM tickets WHERE account_id=$1 AND csat IS NOT NULL AND csat<=2)::int low_csat,
    (SELECT count(*) FROM alerts a JOIN config_items c ON c.id=a.ci_id WHERE c.owner_account_id=$1 AND a.state<>'closed' AND a.severity='critical')::int crit`, [accountId]);
  const score = Math.max(0, 100 - m.open_hi * 10 - m.breaches * 8 - m.low_csat * 10 - m.crit * 5);
  await q('UPDATE accounts SET health_score=$2 WHERE id=$1', [accountId, score]);
  publish('account.health', { account_id: accountId, score });
}

/** Inbound email -> new ticket or reply on an existing thread ([INC-000123] token). */
export async function inboundEmail(m: { from: string; subject: string; body: string }) {
  const tok = /\[?(INC-\d{6})\]?/.exec(m.subject);
  const contact = await one('SELECT * FROM contacts WHERE lower(email)=lower($1)', [m.from]);
  if (tok) {
    const t = await one('SELECT id FROM tickets WHERE number=$1', [tok[1]]);
    if (t) { await reply(t.id, 'customer', m.from, m.body); return { action: 'reply', ticket: await getTicket(t.id) }; }
  }
  const domain = m.from.split('@')[1]?.toLowerCase();
  const account = contact ? { id: contact.account_id } : domain ? await one('SELECT id FROM accounts WHERE lower(email_domain)=$1', [domain]) : undefined;
  const ticket = await createTicket({ subject: m.subject.replace(/^(re|fw):\s*/i, ''), description: m.body, channel: 'email',
    account_id: account?.id ?? null, contact_id: contact?.id ?? null, actor: m.from });
  return { action: 'created', ticket };
}

export async function autoCloseResolved(days = 5, now = new Date()) {
  const rows = await q(`SELECT id FROM tickets WHERE status='Resolved' AND resolved_at < $1`, [new Date(now.getTime() - days * 86400000)]);
  for (const r of rows) await setStatus(r.id, 'Closed', 'system', now);
  return rows.length;
}
