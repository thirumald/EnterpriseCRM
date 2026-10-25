import { useCallback, useEffect, useRef, useState } from 'react';


export async function api<T = any>(path: string, init?: { method?: string; body?: any }): Promise<T> {
  const res = await fetch('/api' + path, {
    method: init?.method ?? (init?.body ? 'POST' : 'GET'),
    headers: { 'content-type': 'application/json' },
    credentials: 'same-origin',
    body: init?.body ? JSON.stringify(init.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && !path.startsWith('/auth/')) window.dispatchEvent(new Event('auth-expired'));
  if (!res.ok) throw new Error(data.error ?? res.statusText);
  return data;
}

/** Shared SSE connection; handlers are called for every domain event. */
const listeners = new Set<(e: any) => void>();
let es: EventSource | null = null;
function ensureStream() {
  if (es) return;
  es = new EventSource('/api/events');
  const types = ['alert.opened', 'alert.closed', 'alert.updated', 'ticket.created', 'ticket.updated', 'ticket.closed', 'sla.warning', 'sla.breached', 'sla.escalated', 'sla.paused', 'sla.resumed',
    'ci.state', 'ci.discovered', 'telemetry.batch', 'collector.stale', 'collector.recovered', 'workflow.executed', 'notification', 'iot.message', 'syslog', 'account.health', 'ci.lifecycle'];
  for (const t of types) es.addEventListener(t, (m) => { const e = JSON.parse((m as MessageEvent).data); listeners.forEach((l) => l(e)); });
}
export function useEvents(handler: (e: any) => void) {
  const ref = useRef(handler); ref.current = handler;
  useEffect(() => { ensureStream(); const l = (e: any) => ref.current(e); listeners.add(l); return () => { listeners.delete(l); }; }, []);
}

/** Fetch + refetch on matching live events (debounced). */
export function useApi<T = any>(path: string | null, opts: { live?: string[]; every?: number } = {}) {
  const [data, setData] = useState<T | undefined>();
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(true);
  const load = useCallback(() => {
    if (!path) return;
    api<T>(path).then((d) => { setData(d); setError(undefined); }).catch((e) => setError(e.message)).finally(() => setLoading(false));
  }, [path]);
  useEffect(() => { setLoading(true); load(); }, [load]);
  const timer = useRef<number | undefined>(undefined);
  useEvents((e) => {
    if (opts.live && opts.live.some((p) => e.type.startsWith(p))) { window.clearTimeout(timer.current); timer.current = window.setTimeout(load, 400); }
  });
  useEffect(() => { if (!opts.every) return; const t = setInterval(load, opts.every); return () => clearInterval(t); }, [load, opts.every]);
  return { data, error, loading, reload: load, setData };
}
