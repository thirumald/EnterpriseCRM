import { useEffect, useState } from 'react';
import { api, useApi, useEvents } from './api';
import { Badge, Card, Empty, fmtTime, SevBadge, Sla, Tile } from './ui';
import { SiteMap, Topology } from './Topology';

export function Noc({ wall, openTicket, openCi }: { wall: boolean; openTicket: (id: number) => void; openCi: (id: number) => void }) {
  const live = ['alert', 'ticket', 'sla', 'ci.', 'collector', 'telemetry'];
  const dash = useApi<any>('/dashboard/noc', { live, every: 15000 });
  const sites = useApi<any[]>('/sites', { live });
  const [site, setSite] = useState<number | null>(null);
  const topo = useApi<any>(`/topology${site ? `?site_id=${site}` : ''}`, { live: ['alert', 'ci.'] });
  const tix = useApi<any[]>('/tickets?status=active', { live });
  const [sel, setSel] = useState<any>(null);
  const [impact, setImpact] = useState<any>(null);
  const [feed, setFeed] = useState<any[]>([]);
  useEffect(() => {
    api<any[]>('/alerts?state=active').then((rows) => setFeed((f) => f.length ? f : rows.slice(0, 20).map((a) => ({ id: 'a' + a.id, at: a.first_seen, type: 'alert.opened', sev: a.severity, text: `${a.ci_name}: ${a.message}` }))));
  }, []);
  useEvents((e) => {
    const t = e.type;
    if (['alert.opened', 'alert.closed', 'sla.breached', 'sla.escalated', 'sla.warning', 'ticket.created', 'collector.stale', 'collector.recovered'].includes(t)) {
      const d = e.data;
      const text = t === 'alert.opened' ? `${d.ci_name ?? 'CI ' + d.ci_id}: ${d.message}` : t === 'alert.closed' ? `Cleared ${d.metric} on CI ${d.ci_id}` : t === 'ticket.created' ? `${d.number} ${d.subject}`
        : t.startsWith('sla') ? `${d.number} ${d.kind ?? ''} ${t.replace('sla.', '')}${d.level ? ' L' + d.level : ''}${d.pct ? ' ' + d.pct + '%' : ''}` : `${d.site ?? 'collector ' + d.collector_id}`;
      setFeed((f) => [{ id: Math.random(), at: e.at, type: t, sev: d.severity, text }, ...f].slice(0, 60));
    }
  });
  const a = dash.data?.alerts, t = dash.data?.tickets;
  const select = async (n: any) => { setSel(n); setImpact(await api(`/cis/${n.id}/impact`)); };
  const hi = impact ? new Set<number>([impact.ci_id, ...impact.dependents.map((d: any) => d.id)]) : null;
  const sitesData = sites.data ?? [];
  return (
    <div className="col">
      {dash.data?.majors?.map((m: any) => (
        <div className="banner" key={m.id}><b style={{ color: 'var(--crit)' }}>MAJOR INCIDENT</b><span>{m.number} {m.subject}</span><button className="btn right" onClick={() => openTicket(m.id)}>Open</button></div>
      ))}
      <div className="grid g6">
        <Tile label="Critical alerts" value={a?.critical ?? '–'} tone={a?.critical ? 'crit' : 'ok'} />
        <Tile label="Warnings" value={a?.warning ?? '–'} tone={a?.warning ? 'warn' : 'ok'} />
        <Tile label="Open tickets (P1 / P2)" value={t ? `${t.open} (${t.p1}/${t.p2})` : '–'} tone={t?.p1 ? 'crit' : undefined} />
        <Tile label="SLA breached (open)" value={t?.breached ?? '–'} tone={t?.breached ? 'crit' : 'ok'} />
        <Tile label="SLA attainment 30d" value={dash.data ? `${dash.data.sla.attainment ?? 100}%` : '–'} tone={(dash.data?.sla.attainment ?? 100) < 95 ? 'warn' : 'ok'} />
        <Tile label="MTTR 30d" value={dash.data?.sla.mttr_min != null ? `${dash.data.sla.mttr_min}m` : '–'} />
      </div>
      <div className="grid g2" style={{ gridTemplateColumns: wall ? 'minmax(0,1.2fr) minmax(0,1fr)' : 'minmax(0,1.1fr) minmax(0,1fr)' }}>
        <div className="col">
          <Card title="Global sites" right={<span className="legend"><span><i className="dot" style={{ background: 'var(--ok)' }} />healthy</span><span><i className="dot" style={{ background: 'var(--warn)' }} />warning</span><span><i className="dot" style={{ background: 'var(--crit)' }} />critical</span><span><i className="dot" style={{ background: 'var(--unk)' }} />collector offline</span></span>}>
            <SiteMap sites={sitesData} collectors={dash.data?.collectors ?? []} selected={site} onSelect={(id) => { setSite(id); setSel(null); setImpact(null); }} />
          </Card>
          <Card title={`Topology ${site ? '– ' + (sitesData.find((s) => s.id === site)?.name ?? '') : '– all sites'}`} right={sel && <button className="btn" onClick={() => { setSel(null); setImpact(null); }}>clear selection</button>}>
            {topo.data ? <Topology nodes={topo.data.nodes} edges={topo.data.edges} selected={sel?.id} highlight={hi} onSelect={select} height={wall ? 520 : 340} /> : <Empty>Loading…</Empty>}
            {sel && impact && (
              <div className="sm" style={{ marginTop: 8 }}>
                <b>{sel.name}</b> <Badge v={sel.state} /> – impacts <b>{impact.dependents.length}</b> device(s) and <b>{impact.accounts.length}</b> customer(s): {impact.accounts.map((x: any) => x.name).join(', ') || 'none'}
                <button className="btn" style={{ marginLeft: 8 }} onClick={() => openCi(sel.id)}>Open CI</button>
              </div>
            )}
          </Card>
        </div>
        <div className="col">
          <Card title="Real-time alert & SLA feed" right={<span className="muted sm">live ●</span>}>
            <div className="ticker" style={{ maxHeight: wall ? 420 : 250 }}>
              {feed.length === 0 && <Empty>Waiting for events… use Infrastructure → Simulator to inject a fault.</Empty>}
              {feed.map((f) => <div key={f.id}><span className="t">{fmtTime(f.at)}</span>{f.type === 'alert.opened' ? <SevBadge s={f.sev ?? 'warning'} /> : <Badge v={f.type.includes('breach') || f.type.includes('stale') ? 'crit' : f.type.includes('closed') || f.type.includes('recovered') ? 'ok' : 'info'} text={f.type.split('.')[1]} />}<span>{f.text}</span></div>)}
            </div>
          </Card>
          <Card title="Ticket & SLA board" right={<span className="muted sm">P1/P2 + breached</span>}>
            <table><thead><tr><th>#</th><th>Pri</th><th>Subject</th><th>Account</th><th>SLA</th></tr></thead><tbody>
              {(tix.data ?? []).filter((x) => ['P1', 'P2'].includes(x.priority) || x.sla_breached).slice(0, wall ? 12 : 7).map((x) => (
                <tr key={x.id} className="click" onClick={() => openTicket(x.id)}><td className="mono">{x.number.replace('INC-', '')}</td><td><Badge v={x.priority} /></td><td>{x.subject.slice(0, 44)}</td><td className="sm">{x.account_name ?? '–'}</td><td><Sla due={x.resolution_due} state={x.resolution_state} label="res" /></td></tr>
              ))}
            </tbody></table>
            {!(tix.data ?? []).some((x) => ['P1', 'P2'].includes(x.priority) || x.sla_breached) && <Empty>No high-priority tickets.</Empty>}
          </Card>
        </div>
      </div>
      <div className="grid g3">
        <Card title="Top CPU">{(dash.data?.topCpu ?? []).map((x: any) => <Meter key={x.ci_id} label={x.name} v={x.value} onClick={() => openCi(x.ci_id)} />)}{!dash.data?.topCpu?.length && <Empty>No samples yet</Empty>}</Card>
        <Card title="Top bandwidth utilisation">{(dash.data?.topBandwidth ?? []).map((x: any) => <Meter key={x.ci_id} label={x.name} v={x.value} onClick={() => openCi(x.ci_id)} />)}{!dash.data?.topBandwidth?.length && <Empty>No samples yet</Empty>}</Card>
        <Card title="Estate health by class">{(dash.data?.byClass ?? []).map((x: any) => <Meter key={x.ci_class} label={`${x.ci_class} (${x.up}/${x.n} up)`} v={(100 * x.up) / x.n} good />)}</Card>
      </div>
      <div className="grid g2">
        <Card title="Collector fabric (Sub DC → Main DC)">
          <table><thead><tr><th>Site</th><th>Status</th><th>WAN</th><th>Queue</th><th>Last beat</th><th>WAN saved</th></tr></thead><tbody>
            {(dash.data?.collectors ?? []).map((c: any) => <tr key={c.id}><td>{c.site_name}</td><td><Badge v={c.status} /></td><td><Badge v={c.wan_up ? 'ok' : 'crit'} text={c.wan_up ? 'up' : 'DOWN'} /></td><td>{c.queue_depth}</td><td className="sm">{fmtTime(c.last_heartbeat)}</td><td>{c.saved_pct}%</td></tr>)}
          </tbody></table>
        </Card>
        <Card title="IoT sensors">
          <table><thead><tr><th>Device</th><th>State</th><th>Last value</th><th>Last seen</th></tr></thead><tbody>
            {(dash.data?.iot ?? []).map((d: any) => <tr key={d.id} className="click" onClick={() => openCi(d.id)}><td>{d.name}</td><td><Badge v={d.state} /></td><td>{d.last_value != null ? `${Number(d.last_value).toFixed(1)} (${d.topic?.split('/').pop()})` : '–'}</td><td className="sm">{fmtTime(d.last_seen)}</td></tr>)}
          </tbody></table>
        </Card>
      </div>
    </div>
  );
}

function Meter({ label, v, onClick, good }: { label: string; v: number; onClick?: () => void; good?: boolean }) {
  const color = good ? (v < 90 ? 'var(--warn)' : 'var(--ok)') : v > 90 ? 'var(--crit)' : v > 75 ? 'var(--warn)' : 'var(--accent)';
  return <div style={{ margin: '6px 0', cursor: onClick ? 'pointer' : undefined }} onClick={onClick}><div className="sm" style={{ display: 'flex', justifyContent: 'space-between' }}><span>{label}</span><b>{v.toFixed(0)}%</b></div><div className="bar"><i style={{ width: `${Math.min(100, v)}%`, background: color }} /></div></div>;
}
