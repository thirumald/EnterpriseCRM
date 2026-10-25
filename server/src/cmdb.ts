import { q, one, audit } from './db.ts';
import { publish } from './events.ts';

/** Relationship semantics: row (from_ci, to_ci) means "from_ci DEPENDS ON to_ci" (to_ci failing impacts from_ci). */

export async function downstream(ciId: number): Promise<{ id: number; depth: number }[]> {
  return q(`WITH RECURSIVE d(id, depth) AS (
      SELECT from_ci, 1 FROM ci_relationships WHERE to_ci=$1
      UNION SELECT r.from_ci, d.depth+1 FROM ci_relationships r JOIN d ON r.to_ci=d.id WHERE d.depth < 12)
    SELECT id, min(depth)::int depth FROM d GROUP BY id ORDER BY 2, 1`, [ciId]);
}

export async function upstream(ciId: number): Promise<{ id: number; depth: number }[]> {
  return q(`WITH RECURSIVE u(id, depth) AS (
      SELECT to_ci, 1 FROM ci_relationships WHERE from_ci=$1
      UNION SELECT r.to_ci, u.depth+1 FROM ci_relationships r JOIN u ON r.from_ci=u.id WHERE u.depth < 12)
    SELECT id, min(depth)::int depth FROM u GROUP BY id ORDER BY 2, 1`, [ciId]);
}

/** Blast radius of a CI: dependent CIs, business impact accounts and covered contracts. */
export async function impact(ciId: number) {
  const dn = await downstream(ciId);
  const ids = [ciId, ...dn.map((d) => d.id)];
  const cis = await q(`SELECT c.id, c.name, c.ci_class, c.state, c.criticality, c.site_id, c.owner_account_id FROM config_items c WHERE c.id = ANY($1) ORDER BY c.id`, [ids]);
  const depth = new Map(dn.map((d) => [d.id, d.depth]));
  const accounts = await q(`SELECT DISTINCT a.id, a.name, a.tier FROM accounts a WHERE a.id IN (
      SELECT owner_account_id FROM config_items WHERE id = ANY($1) AND owner_account_id IS NOT NULL
      UNION SELECT account_id FROM ci_account_impact WHERE ci_id = ANY($1)) ORDER BY a.name`, [ids]);
  return { ci_id: ciId, dependents: cis.filter((c: any) => c.id !== ciId).map((c: any) => ({ ...c, depth: depth.get(c.id) })), accounts };
}

export async function recomputeState(ciId: number) {
  const open = await q(`SELECT severity FROM alerts WHERE ci_id=$1 AND state<>'closed' AND NOT suppressed`, [ciId]);
  const down = (await q(`SELECT 1 FROM alerts WHERE ci_id=$1 AND state<>'closed' AND metric='availability'`, [ciId])).length > 0;
  const state = down ? 'DOWN' : open.length ? 'DEGRADED' : 'UP';
  await q('UPDATE config_items SET state=$2 WHERE id=$1 AND state<>$2', [ciId, state]);
  publish('ci.state', { ci_id: ciId, state });
  // downstream CIs of a DOWN device are UNKNOWN (unreachable) rather than DOWN
  if (state === 'DOWN') {
    for (const d of await downstream(ciId))
      await q(`UPDATE config_items SET state='UNKNOWN' WHERE id=$1 AND state='UP'`, [d.id]);
  } else {
    for (const d of await downstream(ciId)) {
      const stillBlocked = (await upstream(d.id)).length && (await q(`SELECT 1 FROM config_items WHERE id = ANY($1) AND state='DOWN'`, [(await upstream(d.id)).map((u) => u.id)])).length;
      if (!stillBlocked) await recomputeStateLocal(d.id);
    }
  }
  return state;
}
async function recomputeStateLocal(ciId: number) {
  const open = (await q(`SELECT 1 FROM alerts WHERE ci_id=$1 AND state<>'closed' AND NOT suppressed`, [ciId])).length;
  const down = (await q(`SELECT 1 FROM alerts WHERE ci_id=$1 AND state<>'closed' AND metric='availability'`, [ciId])).length;
  await q('UPDATE config_items SET state=$2 WHERE id=$1', [ciId, down ? 'DOWN' : open ? 'DEGRADED' : 'UP']);
  publish('ci.state', { ci_id: ciId });
}

export async function setLifecycle(ciId: number, stage: string, actor: string) {
  const ci = await one('SELECT lifecycle FROM config_items WHERE id=$1', [ciId]);
  if (!ci) throw new Error('CI not found');
  await q('UPDATE config_items SET lifecycle=$2 WHERE id=$1', [ciId, stage]);
  await q('INSERT INTO lifecycle_events(ci_id,from_stage,to_stage,actor) VALUES ($1,$2,$3,$4)', [ciId, ci.lifecycle, stage, actor]);
  if (stage === 'Retired' || stage === 'Disposed') {
    await q(`UPDATE checks SET warn=NULL, crit=NULL WHERE ci_id=$1`, [ciId]);            // stop monitoring
    await q(`UPDATE ip_addresses SET ci_id=NULL, state='free' WHERE ci_id=$1`, [ciId]);  // release IPs
  }
  await audit(actor, 'lifecycle', 'ci', ciId, { from: ci.lifecycle, to: stage });
  publish('ci.lifecycle', { ci_id: ciId, stage });
}

/** Identity-rule reconciliation: serial > mac > hostname. Returns existing CI id or undefined. */
export async function reconcile(d: { serial?: string; mac?: string; hostname?: string }) {
  for (const [col, val] of [['serial', d.serial], ['mac', d.mac], ['hostname', d.hostname]] as const) {
    if (!val) continue;
    const r = await one(`SELECT id FROM config_items WHERE lower(${col})=lower($1)`, [val]);
    if (r) return r.id as number;
  }
}

export async function ipamUtilisation() {
  return q(`SELECT s.id, s.cidr::text cidr, s.name, s.vlan, s.site_id,
      (SELECT count(*)::int FROM ip_addresses i WHERE i.subnet_id=s.id AND i.state<>'free') used,
      GREATEST(2^(32-masklen(s.cidr))::int - 2, 1) total
    FROM subnets s ORDER BY s.cidr`);
}
