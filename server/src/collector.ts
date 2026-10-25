import { q } from './db.ts';
import { readMetric, tcpProbe } from './sim.ts';
import { dirFor, severityFor } from './templates.ts';

export interface Point { ci_id: number; metric: string; time: string; avg: number; min: number; max: number; p95: number; samples: number }
export interface AlertCandidate { ci_id: number; metric: string; severity: 'critical' | 'warning'; clear?: boolean; message: string; value: number }
export interface Batch { collector_id: number; seq: number; sent_at: string; points: Point[]; alerts: AlertCandidate[]; raw_samples: number }
export type Transport = (b: Batch) => Promise<void>;

function p95(a: number[]) { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(0.95 * s.length))]; }

/** Edge (Sub-DC) collector. Polls LOCAL devices at full resolution, evaluates thresholds locally (so alerts fire
 *  even when the WAN is down), aggregates raw samples into windows, and forwards compact batches to the Main DC with
 *  store-and-forward: batches queue while the WAN is down and replay in order (idempotent by seq) on recovery. */
export class EdgeCollector {
  seq = 0;
  queue: Batch[] = [];
  wanUp = true;
  private raw = new Map<string, number[]>();           // "ci:metric" -> samples in current window
  private streak = new Map<string, { sev: string | null; n: number }>();
  private active = new Map<string, string>();          // open alert fingerprints -> severity
  private pendingAlerts: AlertCandidate[] = [];
  private checks: any[] = [];
  private cis = new Map<number, any>();
  private windowStart = Date.now();
  rawTotal = 0;

  constructor(public collectorId: number, public siteId: number, private transport: Transport, public windowSec = 60) {}

  async reloadConfig() {
    this.checks = await q(`SELECT ch.*, ci.attributes, ci.lifecycle FROM checks ch JOIN config_items ci ON ci.id=ch.ci_id
      WHERE ci.site_id=$1 AND ci.lifecycle NOT IN ('Retired','Disposed') AND (ch.warn IS NOT NULL OR ch.crit IS NOT NULL)`, [this.siteId]);
  }

  /** One polling cycle (every 10-60s in production). */
  async poll(now = Date.now()) {
    if (!this.checks.length) await this.reloadConfig();
    for (const ch of this.checks) {
      if (ch.protocol === 'MQTT') continue; // push-based, handled via ingestIot
      let v: number | undefined;
      const probe = ch.attributes?.probe;
      if (ch.metric === 'availability' && probe) v = (await tcpProbe(probe.host, probe.port)) ? 1 : 0;
      else v = readMetric(ch.ci_id, ch.metric, now);
      if (v === undefined) continue;                                    // unreachable device: no data point
      const key = `${ch.ci_id}:${ch.metric}`;
      (this.raw.get(key) ?? this.raw.set(key, []).get(key)!).push(v);
      this.rawTotal++;
      this.evaluate(ch, v, key);
    }
  }

  private evaluate(ch: any, v: number, key: string) {
    const sev = severityFor(v, ch.warn, ch.crit, dirFor(ch.metric));
    const st = this.streak.get(key) ?? { sev: null, n: 0 };
    if (st.sev === sev) st.n++; else { st.sev = sev; st.n = 1; }     // hysteresis: need N consecutive samples to change state
    this.streak.set(key, st);
    if (st.n < (ch.sustain_samples ?? 3)) return;
    const open = this.active.get(key);
    if (sev && open !== sev) {
      this.active.set(key, sev);
      this.pendingAlerts.push({ ci_id: ch.ci_id, metric: ch.metric, severity: sev, value: v, message: `${ch.metric} ${sev} (${v.toFixed(1)})` });
    } else if (!sev && open) {
      this.active.delete(key);
      this.pendingAlerts.push({ ci_id: ch.ci_id, metric: ch.metric, severity: 'warning', clear: true, value: v, message: `${ch.metric} recovered` });
    }
  }

  /** Close the aggregation window: build one batch and try to ship the backlog. */
  async flush(now = Date.now()) {
    const t = new Date(Math.floor(now / (this.windowSec * 1000)) * this.windowSec * 1000).toISOString();
    const points: Point[] = [];
    for (const [key, vals] of this.raw) {
      if (!vals.length) continue;
      const [ci, ...m] = key.split(':');
      points.push({ ci_id: Number(ci), metric: m.join(':'), time: t, avg: vals.reduce((a, b) => a + b, 0) / vals.length, min: Math.min(...vals), max: Math.max(...vals), p95: p95(vals), samples: vals.length });
    }
    const raw_samples = [...this.raw.values()].reduce((n, v) => n + v.length, 0);
    this.raw.clear();
    const alerts = this.pendingAlerts.splice(0);
    if (points.length || alerts.length) this.queue.push({ collector_id: this.collectorId, seq: ++this.seq, sent_at: new Date(now).toISOString(), points, alerts, raw_samples });
    await this.drain();
    this.windowStart = now;
  }

  async drain() {
    while (this.wanUp && this.queue.length) {
      try { await this.transport(this.queue[0]); this.queue.shift(); }
      catch { break; }                                                  // WAN/Main DC unavailable: keep for retry
    }
  }
}
