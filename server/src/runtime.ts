import { q } from './db.ts';
import { EdgeCollector } from './collector.ts';
import * as mon from './monitoring.ts';
import * as sla from './slaService.ts';
import * as al from './alerts.ts';
import * as hd from './helpdesk.ts';
import { clearFault, injectFault } from './sim.ts';

/** Hosts the demo Sub-DC collectors in-process and drives all schedulers.
 *  In production each EdgeCollector runs at its Sub DC and talks to POST /api/ingest/batch over mTLS. */
export const collectors = new Map<number, EdgeCollector>();
const timers: NodeJS.Timeout[] = [];

export async function startCollectors(windowSec = Number(process.env.AGG_WINDOW_SEC ?? 15)) {
  for (const c of await q('SELECT * FROM collectors ORDER BY id')) {
    const ec = new EdgeCollector(c.id, c.site_id, async (b) => { await mon.ingestBatch(b); }, windowSec);
    ec.seq = Number(c.last_seq);
    collectors.set(c.id, ec);
  }
}

export function setWan(collectorId: number, up: boolean) {
  const c = collectors.get(collectorId);
  if (!c) throw new Error('unknown collector');
  c.wanUp = up;
  return q('UPDATE collectors SET wan_up=$2 WHERE id=$1', [collectorId, up]);
}

export function startSchedulers() {
  const pollMs = Number(process.env.POLL_MS ?? 3000);
  const winMs = Number(process.env.AGG_WINDOW_SEC ?? 15) * 1000;
  const safe = (fn: () => Promise<any>) => () => fn().catch((e) => console.error('[sched]', e.message));
  timers.push(setInterval(safe(async () => { for (const c of collectors.values()) await c.poll(); }), pollMs));
  timers.push(setInterval(safe(async () => {
    for (const c of collectors.values()) { await c.flush(); await mon.heartbeat(c.collectorId, c.queue.length, c.wanUp); }
  }), winMs));
  timers.push(setInterval(safe(() => mon.collectorWatchdog(new Date(), Number(process.env.HEARTBEAT_SEC ?? 15))), 5000));
  timers.push(setInterval(safe(() => sla.slaTick()), Number(process.env.SLA_TICK_MS ?? 5000)));
  timers.push(setInterval(safe(() => al.deferredAlertTickets()), 30000));
  timers.push(setInterval(safe(() => mon.iotStaleScan()), 30000));
  timers.push(setInterval(safe(async () => { await al.warrantyScan(); await al.renewalRiskScan(); await hd.autoCloseResolved(); await mon.pruneMetrics(); }), 3600_000));
  safe(async () => { await al.warrantyScan(); await al.renewalRiskScan(); })();
}
export function stopSchedulers() { timers.splice(0).forEach(clearInterval); }
export { injectFault, clearFault };

al.setRunbookExecutor(async (ciId, metric) => { clearFault(ciId, metric); return true; });
