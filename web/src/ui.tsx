import { useEffect, useState, type ReactNode } from 'react';

export const Badge = ({ v, text }: { v: string; text?: string }) => <span className={`badge b-${String(v).split(' ')[0]}`}>{text ?? v}</span>;
export const SevBadge = ({ s }: { s: string }) => <Badge v={s === 'critical' ? 'crit' : s === 'warning' ? 'warn' : 'info'} text={s} />;
export const Card = ({ title, right, children, className = '' }: { title?: ReactNode; right?: ReactNode; children: ReactNode; className?: string }) =>
  <div className={`card ${className}`}>{title && <h3><span>{title}</span><span>{right}</span></h3>}{children}</div>;
export const Tile = ({ label, value, tone }: { label: string; value: ReactNode; tone?: 'crit' | 'warn' | 'ok' }) =>
  <div className="card tile"><b style={{ color: tone ? `var(--${tone})` : undefined }}>{value}</b><span>{label}</span></div>;

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return <div className="modal" onClick={onClose}><div onClick={(e) => e.stopPropagation()}><h3 style={{ marginTop: 0, display: 'flex' }}>{title}<button className="btn right" onClick={onClose}>✕</button></h3>{children}</div></div>;
}
export function Drawer({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  return <div className="drawer"><button className="btn right" style={{ float: 'right' }} onClick={onClose}>✕ Close</button>{children}</div>;
}
export const fmtTime = (s?: string) => s ? new Date(s).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '';
export const fmtDate = (s?: string) => s ? new Date(s).toLocaleDateString() : '';
export const fmtDT = (s?: string) => s ? new Date(s).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }) : '';
export const money = (n: number) => '$' + Math.round(n).toLocaleString();

export function useNow(ms = 1000) {
  const [n, setN] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setN(Date.now()), ms); return () => clearInterval(t); }, [ms]);
  return n;
}
export function dur(mins: number) {
  const a = Math.abs(mins); const h = Math.floor(a / 60); const m = Math.floor(a % 60);
  if (h >= 48) return `${Math.floor(h / 24)}d ${h % 24}h`;
  return h ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m ${String(Math.floor((a * 60) % 60)).padStart(2, '0')}s`;
}
/** Live SLA countdown chip. */
export function Sla({ due, state, label }: { due?: string; state?: string; label: string }) {
  const now = useNow(1000);
  if (!due || !state) return <span className="muted sm">{label}: n/a</span>;
  if (state === 'met') return <span className="badge b-met">{label} met</span>;
  if (state === 'paused') return <span className="badge b-paused">{label} paused</span>;
  const left = (new Date(due).getTime() - now) / 60000;
  const cls = state === 'breached' || left < 0 ? 'breached' : left < 15 ? 'P2' : 'running';
  return <span className={`badge b-${cls}`} title={`due ${fmtDT(due)}`}>{label} {left < 0 ? '-' : ''}{dur(left)}</span>;
}

export function Spark({ values, w = 160, h = 36, color = 'var(--accent)', max }: { values: number[]; w?: number; h?: number; color?: string; max?: number }) {
  if (values.length < 2) return <span className="muted sm">no data</span>;
  const mx = max ?? Math.max(...values, 1), mn = Math.min(...values, 0);
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * w},${h - ((v - mn) / (mx - mn || 1)) * (h - 4) - 2}`).join(' ');
  return <svg width={w} height={h}><polyline points={pts} fill="none" stroke={color} strokeWidth={1.6} /></svg>;
}
export function LineChart({ points, w = 480, h = 140, unit = '' }: { points: { t: string; avg: number; max: number }[]; w?: number; h?: number; unit?: string }) {
  if (points.length < 2) return <div className="muted sm">No samples yet</div>;
  const mx = Math.max(...points.map((p) => p.max), 1);
  const x = (i: number) => 30 + (i / (points.length - 1)) * (w - 36), y = (v: number) => h - 16 - (v / mx) * (h - 28);
  return <svg width="100%" viewBox={`0 0 ${w} ${h}`}>
    {[0, 0.5, 1].map((f) => <g key={f}><line x1={30} x2={w - 6} y1={y(mx * f)} y2={y(mx * f)} stroke="var(--line)" /><text x={0} y={y(mx * f) + 4}>{Math.round(mx * f)}</text></g>)}
    <polyline fill="none" stroke="var(--warn)" strokeWidth={1} strokeDasharray="3 3" points={points.map((p, i) => `${x(i)},${y(p.max)}`).join(' ')} />
    <polyline fill="none" stroke="var(--accent)" strokeWidth={2} points={points.map((p, i) => `${x(i)},${y(p.avg)}`).join(' ')} />
    <text x={30} y={h - 2}>{fmtTime(points[0].t)}</text><text x={w - 70} y={h - 2}>{fmtTime(points[points.length - 1].t)} {unit}</text>
  </svg>;
}
export const Empty = ({ children = 'Nothing here.' }: { children?: ReactNode }) => <div className="muted" style={{ padding: 12 }}>{children}</div>;
export const stateColor = (s: string) => ({ UP: 'var(--ok)', DOWN: 'var(--crit)', DEGRADED: 'var(--warn)', UNKNOWN: 'var(--unk)' } as any)[s] ?? 'var(--unk)';
