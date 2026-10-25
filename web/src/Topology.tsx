import { useMemo } from 'react';
import { stateColor } from './ui';

const ICON: Record<string, string> = { Router: '⇄', Switch: '⇆', Firewall: '▥', Server: '▤', VM: '▫', IoT: '◉', UPS: '⚡', Endpoint: '▭', Storage: '▦' };

export function Topology({ nodes, edges, selected, highlight, onSelect, height = 360 }: {
  nodes: any[]; edges: any[]; selected?: number | null; highlight?: Set<number> | null; onSelect?: (n: any) => void; height?: number;
}) {
  const layout = useMemo(() => {
    const out = new Map<number, number[]>();
    for (const e of edges) (out.get(e.from_ci) ?? out.set(e.from_ci, []).get(e.from_ci)!).push(e.to_ci);
    const memo = new Map<number, number>();
    const layer = (id: number, d = 0): number => {
      if (memo.has(id)) return memo.get(id)!;
      if (d > 12) return 0;
      const to = out.get(id) ?? [];
      const v = to.length ? 1 + Math.max(...to.map((t) => layer(t, d + 1))) : 0;
      memo.set(id, v); return v;
    };
    const layers: any[][] = [];
    for (const n of nodes) { const l = layer(n.id); (layers[l] ??= []).push(n); }
    const W = 132, H = 74, pos = new Map<number, { x: number; y: number }>();
    const maxCols = Math.max(1, ...layers.map((l) => l?.length ?? 0));
    layers.forEach((l, i) => (l ?? []).sort((a, b) => a.name.localeCompare(b.name)).forEach((n, j) => {
      const off = ((maxCols - l.length) * W) / 2;
      pos.set(n.id, { x: 10 + off + j * W, y: 12 + i * H });
    }));
    return { pos, w: 20 + maxCols * W, h: 30 + layers.length * H };
  }, [nodes, edges]);

  if (!nodes.length) return <div className="muted">No devices</div>;
  const dim = (id: number) => highlight && !highlight.has(id);
  return (
    <div style={{ overflow: 'auto', maxHeight: height }}>
      <svg width={Math.max(layout.w, 300)} height={layout.h}>
        {edges.map((e) => {
          const a = layout.pos.get(e.from_ci), b = layout.pos.get(e.to_ci);
          if (!a || !b) return null;
          const hot = highlight && highlight.has(e.from_ci) && highlight.has(e.to_ci);
          return <line key={e.id} x1={a.x + 55} y1={a.y} x2={b.x + 55} y2={b.y + 34} stroke={hot ? 'var(--crit)' : 'var(--line)'} strokeWidth={hot ? 2 : 1.2} strokeDasharray={e.attrs?.wan ? '5 4' : undefined} opacity={highlight && !hot ? 0.25 : 1} />;
        })}
        {nodes.map((n) => {
          const p = layout.pos.get(n.id)!;
          if (!p) return null;
          return (
            <g key={n.id} className="node" transform={`translate(${p.x},${p.y})`} opacity={dim(n.id) ? 0.3 : 1} onClick={() => onSelect?.(n)}>
              <title>{`${n.name} (${n.ci_class}) - ${n.state}`}</title>
              <rect width={112} height={34} rx={6} fill="var(--panel2)" stroke={selected === n.id ? 'var(--accent)' : stateColor(n.state)} strokeWidth={selected === n.id ? 2.5 : 1.8} />
              <text x={8} y={14}>{ICON[n.ci_class] ?? '•'} {n.name.length > 15 ? n.name.slice(0, 14) + '…' : n.name}</text>
              <text x={8} y={27} style={{ fill: stateColor(n.state), fontSize: 10 }}>{n.state}{n.alerts ? ` · ${n.alerts} alert${n.alerts > 1 ? 's' : ''}` : ''}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/** Schematic geo map of Main + Sub DCs; WAN links drawn Sub -> Main. */
export function SiteMap({ sites, collectors, onSelect, selected }: { sites: any[]; collectors: any[]; onSelect: (id: number | null) => void; selected: number | null }) {
  const W = 560, H = 250;
  const px = (lon: number) => ((lon + 12) / 40) * W, py = (lat: number) => H - ((lat - 36) / 22) * H;
  const main = sites.find((s) => s.dc_tier === 'MAIN');
  const color = (s: any) => s.collector_status === 'STALE' ? 'var(--unk)' : s.critical_alerts ? 'var(--crit)' : s.open_alerts ? 'var(--warn)' : 'var(--ok)';
  const col = (sid: number) => collectors.find((c) => c.site_id === sid || c.site_name === sites.find((s) => s.id === sid)?.name);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ background: 'var(--bg)', borderRadius: 6, maxHeight: 300 }}>
      {[0, 1, 2, 3, 4].map((i) => <line key={'h' + i} x1={0} x2={W} y1={(i * H) / 4} y2={(i * H) / 4} stroke="var(--line)" opacity={0.5} />)}
      {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => <line key={'v' + i} y1={0} y2={H} x1={(i * W) / 7} x2={(i * W) / 7} stroke="var(--line)" opacity={0.5} />)}
      {main && sites.filter((s) => s.dc_tier === 'SUB').map((s) => {
        const c = col(s.id);
        return <line key={'l' + s.id} x1={px(s.lon)} y1={py(s.lat)} x2={px(main.lon)} y2={py(main.lat)} stroke={c && c.wan_up === false ? 'var(--crit)' : 'var(--accent)'} strokeWidth={1.5} strokeDasharray="6 4" opacity={0.8} />;
      })}
      {sites.map((s) => (
        <g key={s.id} className="node" onClick={() => onSelect(selected === s.id ? null : s.id)}>
          <circle cx={px(s.lon)} cy={py(s.lat)} r={s.dc_tier === 'MAIN' ? 13 : 9} fill={color(s)} fillOpacity={0.25} stroke={selected === s.id ? 'var(--text)' : color(s)} strokeWidth={2} />
          <text x={px(s.lon) + (px(s.lon) > W * 0.7 ? -14 : 14)} y={py(s.lat) + 4} textAnchor={px(s.lon) > W * 0.7 ? 'end' : 'start'}>{s.name.replace(/ - /, ': ')}</text>
          <text x={px(s.lon) + (px(s.lon) > W * 0.7 ? -14 : 14)} y={py(s.lat) + 16} textAnchor={px(s.lon) > W * 0.7 ? 'end' : 'start'} style={{ fill: 'var(--muted)', fontSize: 10 }}>{s.open_alerts} alerts · {s.cis} CIs{s.collector_status === 'STALE' ? ' · COLLECTOR OFFLINE' : ''}</text>
        </g>
      ))}
    </svg>
  );
}
