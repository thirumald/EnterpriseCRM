import { q, one } from './db.ts';
import { publish } from './events.ts';
import { addBusinessMinutes, businessMinutesBetween, pctConsumed, type Calendar } from './sla.ts';

export const DEFAULT_ESCALATION = { warn: [75, 90], l2_after_min: 30, l3_after_min: 120 };

export async function loadCalendar(id: number | null): Promise<Calendar | null> {
  if (!id) return null;
  const c = await one('SELECT * FROM business_calendars WHERE id=$1', [id]);
  if (!c) return null;
  return { utcOffsetMin: c.utc_offset_min, hours: c.hours, holidays: c.holidays };
}

/** Contract resolution: explicit > one that covers the CI > the account's best active contract. */
export async function resolveContract(accountId: number | null, ciId: number | null) {
  if (!accountId) return undefined;
  if (ciId) {
    const c = await one(`SELECT c.* FROM contracts c JOIN contract_covered_ci cc ON cc.contract_id=c.id
      WHERE c.account_id=$1 AND cc.ci_id=$2 AND c.status='active' AND CURRENT_DATE BETWEEN c.start_date AND c.end_date LIMIT 1`, [accountId, ciId]);
    if (c) return { ...c, covered: true };
  }
  const c = await one(`SELECT * FROM contracts WHERE account_id=$1 AND status='active'
    AND CURRENT_DATE BETWEEN start_date AND end_date ORDER BY value DESC LIMIT 1`, [accountId]);
  return c ? { ...c, covered: !ciId } : undefined;
}

export async function startTimers(ticketId: number, now = new Date()) {
  const t = await one('SELECT * FROM tickets WHERE id=$1', [ticketId]);
  if (!t) return;
  const contract = t.contract_id ? await one('SELECT * FROM contracts WHERE id=$1', [t.contract_id]) : await resolveContract(t.account_id, t.ci_id);
  if (!contract) return;
  if (!t.contract_id) await q('UPDATE tickets SET contract_id=$1 WHERE id=$2', [contract.id, ticketId]);
  const policy = await one('SELECT * FROM sla_policies WHERE id=$1', [contract.sla_policy_id]);
  const target = policy?.targets?.[t.priority];
  if (!target) return;
  const cal = await loadCalendar(policy.calendar_id);
  const maint = t.ci_id ? await one(`SELECT 1 x FROM maintenance_windows WHERE pause_sla AND ci_id=$1 AND $2 BETWEEN start_at AND end_at`, [t.ci_id, now]) : undefined;
  for (const kind of ['response', 'resolution'] as const) {
    const mins = target[kind];
    const useCal = target.clock === '24x7' ? null : cal;
    const due = addBusinessMinutes(now, mins, useCal);
    await q(`INSERT INTO sla_timers(ticket_id,kind,state,target_min,clock,calendar_id,started_at,due_at,paused_at,remaining_min)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT (ticket_id,kind) DO NOTHING`,
      [ticketId, kind, maint ? 'paused' : 'running', mins, target.clock, policy.calendar_id, now, due, maint ? now : null, mins]);
  }
  publish('sla.timers_started', { ticket_id: ticketId });
}

async function timerCal(t: any): Promise<Calendar | null> {
  return t.clock === '24x7' ? null : loadCalendar(t.calendar_id);
}

export async function pauseTimers(ticketId: number, now = new Date()) {
  const timers = await q(`SELECT * FROM sla_timers WHERE ticket_id=$1 AND state='running'`, [ticketId]);
  for (const t of timers) {
    const rem = businessMinutesBetween(now, t.due_at, await timerCal(t));
    await q(`UPDATE sla_timers SET state='paused', paused_at=$2, remaining_min=$3 WHERE id=$1`, [t.id, now, rem]);
  }
  if (timers.length) publish('sla.paused', { ticket_id: ticketId });
}

export async function resumeTimers(ticketId: number, now = new Date()) {
  const timers = await q(`SELECT * FROM sla_timers WHERE ticket_id=$1 AND state='paused'`, [ticketId]);
  for (const t of timers) {
    const due = addBusinessMinutes(now, t.remaining_min, await timerCal(t));
    await q(`UPDATE sla_timers SET state='running', paused_at=NULL, due_at=$2 WHERE id=$1`, [t.id, due]);
  }
  if (timers.length) publish('sla.resumed', { ticket_id: ticketId });
}

export async function markMet(ticketId: number, kind: 'response' | 'resolution', now = new Date()) {
  const r = await q(`UPDATE sla_timers SET state=CASE WHEN state='breached' THEN 'breached' ELSE 'met' END, met_at=$3
    WHERE ticket_id=$1 AND kind=$2 AND met_at IS NULL RETURNING state`, [ticketId, kind, now]);
  if (r.length && r[0].state === 'met') publish(`sla.${kind}_met`, { ticket_id: ticketId });
}

/** After a priority change, recompute due dates from the original start. */
export async function recomputeTimers(ticketId: number, now = new Date()) {
  const t = await one('SELECT * FROM tickets WHERE id=$1', [ticketId]);
  const contract = t?.contract_id ? await one('SELECT * FROM contracts WHERE id=$1', [t.contract_id]) : undefined;
  if (!t || !contract) return;
  const policy = await one('SELECT * FROM sla_policies WHERE id=$1', [contract.sla_policy_id]);
  const target = policy?.targets?.[t.priority];
  if (!target) return;
  const cal = target.clock === '24x7' ? null : await loadCalendar(policy.calendar_id);
  for (const kind of ['response', 'resolution'] as const) {
    const tm = await one('SELECT * FROM sla_timers WHERE ticket_id=$1 AND kind=$2', [ticketId, kind]);
    if (!tm || tm.met_at) continue;
    const due = addBusinessMinutes(tm.started_at, target[kind], cal);
    await q(`UPDATE sla_timers SET target_min=$2, clock=$3, due_at=$4, remaining_min=CASE WHEN state='paused' THEN $5 ELSE remaining_min END WHERE id=$1`,
      [tm.id, target[kind], target.clock, due, Math.max(0, target[kind] - businessMinutesBetween(tm.started_at, tm.paused_at ?? now, cal))]);
  }
}

/** Periodic evaluation: warnings, breaches, multi-level escalation. `now` injected for deterministic tests. */
export async function slaTick(now = new Date()) {
  const timers = await q(`SELECT st.*, t.priority, t.account_id, t.number, t.subject, t.escalation_level, t.contract_id
    FROM sla_timers st JOIN tickets t ON t.id=st.ticket_id WHERE st.met_at IS NULL AND st.state IN ('running','breached')`);
  for (const t of timers) {
    const cal = await timerCal(t);
    const pct = pctConsumed(t, now, cal);
    if (t.state === 'running') {
      const warns: number[] = (await one(`SELECT p.escalation FROM contracts c JOIN sla_policies p ON p.id=c.sla_policy_id WHERE c.id=$1`, [t.contract_id]))?.escalation?.warn ?? [75, 90];
      const crossed = warns.filter((w) => pct >= w && w > t.warned_pct && pct < 100).sort((a, b) => b - a)[0];
      if (crossed) {
        await q('UPDATE sla_timers SET warned_pct=$2 WHERE id=$1', [t.id, crossed]);
        await q(`INSERT INTO ticket_events(ticket_id,type,actor,body) VALUES ($1,'sla_warning','system',$2)`, [t.ticket_id, `${t.kind} SLA at ${crossed}%`]);
        publish('sla.warning', { ticket_id: t.ticket_id, number: t.number, kind: t.kind, pct: crossed });
      }
      if (now >= t.due_at) {
        await q(`UPDATE sla_timers SET state='breached', breached_at=$2 WHERE id=$1`, [t.id, t.due_at]);
        await q('UPDATE tickets SET sla_breached=true, escalation_level=GREATEST(escalation_level,1), updated_at=$2 WHERE id=$1', [t.ticket_id, now]);
        await q(`INSERT INTO ticket_events(ticket_id,type,actor,body) VALUES ($1,'sla_breached','system',$2)`, [t.ticket_id, `${t.kind} SLA breached - escalated to Team Lead`]);
        publish('sla.breached', { ticket_id: t.ticket_id, number: t.number, kind: t.kind, priority: t.priority, level: 1 });
      }
    } else if (t.state === 'breached' && t.breached_at) {
      const esc = (await one(`SELECT p.escalation FROM contracts c JOIN sla_policies p ON p.id=c.sla_policy_id WHERE c.id=$1`, [t.contract_id]))?.escalation ?? { l2_after_min: 30, l3_after_min: 120 };
      const over = (now.getTime() - new Date(t.breached_at).getTime()) / 60_000;
      const level = over >= esc.l3_after_min ? 3 : over >= esc.l2_after_min ? 2 : 1;
      if (level > t.escalation_level && ['P1', 'P2'].includes(t.priority)) {
        const who = level === 2 ? 'Incident Manager' : 'Service Director + Account Executive';
        await q('UPDATE tickets SET escalation_level=$2, updated_at=$3 WHERE id=$1', [t.ticket_id, level, now]);
        await q(`INSERT INTO ticket_events(ticket_id,type,actor,body) VALUES ($1,'escalation','system',$2)`, [t.ticket_id, `Escalated to level ${level}: ${who}`]);
        publish('sla.escalated', { ticket_id: t.ticket_id, number: t.number, level, notify: who });
      }
    }
  }
}
