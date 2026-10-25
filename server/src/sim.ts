/** Device simulator used by the demo collectors: deterministic baselines plus injectable faults.
 *  Replace `readMetric` with real SNMP/WMI/SSH/agent drivers in production; the collector contract stays the same. */
import net from 'node:net';

export type Fault = { mode: 'down' | 'spike'; metric?: string; value?: number } | { mode: 'service'; metric: string };
const faults = new Map<number, Map<string, number | 'down'>>(); // ciId -> metric -> forced value

export function injectFault(ciId: number, metric: string, value: number | 'down') {
  if (!faults.has(ciId)) faults.set(ciId, new Map());
  faults.get(ciId)!.set(metric, value);
}
export function clearFault(ciId: number, metric?: string) {
  if (!metric) faults.delete(ciId); else faults.get(ciId)?.delete(metric);
}
export function activeFaults() {
  return [...faults.entries()].flatMap(([ci, m]) => [...m.entries()].map(([metric, value]) => ({ ci_id: ci, metric, value })));
}

function hash(n: number, s: string) { let h = n * 2654435761; for (const c of s) h = (h ^ c.charCodeAt(0)) * 16777619; return (h >>> 0) / 4294967296; }
const BASE: Record<string, number> = { cpu: 28, mem: 52, disk: 61, bandwidth: 35, temperature: 24, battery: 87, service: 1, availability: 1 };

export function readMetric(ciId: number, metric: string, t: number): number | undefined {
  const f = faults.get(ciId);
  if (f?.get('availability') === 'down') return metric === 'availability' ? 0 : undefined; // device unreachable: no other data
  const forced = f?.get(metric);
  if (forced === 'down') return metric === 'availability' || metric === 'service' ? 0 : undefined;
  if (typeof forced === 'number') return forced;
  const base = BASE[metric] ?? 50;
  if (metric === 'availability' || metric === 'service') return 1;
  const jitter = (hash(ciId, metric + Math.floor(t / 1000)) - 0.5) * 10;
  const drift = Math.sin(t / 60000 + ciId) * 6;
  return Math.max(0, Math.min(100, base + (hash(ciId, metric) - 0.5) * 20 + drift + jitter));
}

/** Real TCP reachability probe (used when a CI has attributes.probe = {host, port}). */
export function tcpProbe(host: string, port: number, timeoutMs = 1500): Promise<boolean> {
  return new Promise((resolve) => {
    const s = net.connect({ host, port, timeout: timeoutMs });
    s.once('connect', () => { s.destroy(); resolve(true); });
    s.once('timeout', () => { s.destroy(); resolve(false); });
    s.once('error', () => resolve(false));
  });
}
