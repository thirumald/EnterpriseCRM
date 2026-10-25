import { useState } from 'react';
import { api, useApi } from './api';
import { Topology } from './Topology';
import { Badge, Card, Drawer, Empty, fmtDate, fmtDT, fmtTime, LineChart, Modal, SevBadge } from './ui';

const TABS = ['Alerts', 'CMDB', 'Dependency map', 'IPAM', 'Discovery', 'Maintenance', 'Simulator'] as const;

export function Engineer({ openTicket, initialCi, sim }: { openTicket: (id: number) => void; initialCi?: number | null; sim: boolean }) {
  const [tab, setTab] = useState<(typeof TABS)[number]>(initialCi ? 'CMDB' : 'Alerts');
  const [ci, setCi] = useState<number | null>(initialCi ?? null);
  return (
    <div>
      <div className="tabs">{TABS.filter((t) => sim || t !== 'Simulator').map((t) => <button key={t} className={`tab ${tab === t ? 'on' : ''}`} onClick={() => setTab(t)}>{t}</button>)}</div>
      {tab === 'Alerts' && <Alerts openTicket={openTicket} openCi={setCi} />}
      {tab === 'CMDB' && <Cmdb openCi={setCi} />}
      {tab === 'Dependency map' && <DepMap openCi={setCi} />}
      {tab === 'IPAM' && <Ipam />}
      {tab === 'Discovery' && <Discovery openCi={setCi} />}
      {tab === 'Maintenance' && <Maintenance />}
      {tab === 'Simulator' && <Simulator />}
      {ci && <CiDrawer id={ci} onClose={() => setCi(null)} openTicket={openTicket} openCi={setCi} />}
    </div>
  );
}

function Alerts({ openTicket, openCi }: { openTicket: (id: number) => void; openCi: (id: number) => void }) {
  const [state, setState] = useState('active');
  const al = useApi<any[]>(`/alerts?state=${state}`, { live: ['alert'] });
  const [sev, setSev] = useState('');
  const rows = (al.data ?? []).filter((a) => !sev || a.severity === sev);
  return (
    <Card title="Alert console" right={<span style={{ display: 'flex', gap: 6 }}>
      <select value={sev} onChange={(e) => setSev(e.target.value)}><option value="">all severities</option><option>critical</option><option>warning</option></select>
      <select value={state} onChange={(e) => setState(e.target.value)}><option>active</option><option>open</option><option>acked</option><option>closed</option><option>all</option></select></span>}>
      <table><thead><tr><th>Sev</th><th>Device</th><th>Site</th><th>Account</th><th>Condition</th><th>First seen</th><th>×</th><th>Ticket</th><th></th></tr></thead><tbody>
        {rows.map((a) => (
          <tr key={a.id} style={{ opacity: a.suppressed ? 0.5 : 1 }}>
            <td><SevBadge s={a.severity} /></td>
            <td><a href="#" onClick={(e) => { e.preventDefault(); openCi(a.ci_id); }}>{a.ci_name}</a></td>
            <td className="sm">{a.site_name}</td><td className="sm">{a.account_name ?? '–'}</td>
            <td>{a.message}{a.suppressed && <> <Badge v="paused" text="maintenance" /></>}{a.root_cause_ci && <> <Badge v="UNKNOWN" text="downstream" /></>}</td>
            <td className="sm">{fmtDT(a.first_seen)}</td><td>{a.repeat_count}</td>
            <td>{a.ticket_id ? <a href="#" onClick={(e) => { e.preventDefault(); openTicket(a.ticket_id); }}>{a.ticket_number}</a> : <button className="btn" onClick={async () => { const t = await api(`/alerts/${a.id}/ticket`, { body: {} }); al.reload(); openTicket(t.id); }}>Create</button>}</td>
            <td>{a.state === 'open' ? <button className="btn" onClick={async () => { await api(`/alerts/${a.id}/ack`, { body: {} }); al.reload(); }}>Ack</button> : <Badge v={a.state === 'closed' ? 'Closed' : 'ok'} text={a.state} />}</td>
          </tr>
        ))}
      </tbody></table>
      {!rows.length && <Empty>No alerts. Inject a fault from the Simulator tab.</Empty>}
    </Card>
  );
}

function Cmdb({ openCi }: { openCi: (id: number) => void }) {
  const [f, setF] = useState<any>({});
  const qs = new URLSearchParams(Object.entries(f).filter(([, v]) => v) as any).toString();
  const cis = useApi<any[]>(`/cis?${qs}`, { live: ['ci.', 'alert'] });
  const meta = useApi<any>('/meta');
  const sites = useApi<any[]>('/sites');
  const [adding, setAdding] = useState(false);
  return (
    <Card title={`Configuration items (${cis.data?.length ?? 0})`} right={<button className="btn pri" onClick={() => setAdding(true)}>+ Add CI</button>}>
      <div className="row" style={{ marginBottom: 8 }}>
        <input placeholder="name / serial / hostname" onChange={(e) => setF({ ...f, q: e.target.value })} />
        <select onChange={(e) => setF({ ...f, class: e.target.value })}><option value="">all classes</option>{meta.data?.ciClasses.map((c: string) => <option key={c}>{c}</option>)}</select>
        <select onChange={(e) => setF({ ...f, site_id: e.target.value })}><option value="">all sites</option>{sites.data?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
        <select onChange={(e) => setF({ ...f, state: e.target.value })}><option value="">any state</option><option>UP</option><option>DOWN</option><option>DEGRADED</option><option>UNKNOWN</option></select>
        <select onChange={(e) => setF({ ...f, lifecycle: e.target.value })}><option value="">any lifecycle</option>{meta.data?.lifecycle.map((c: string) => <option key={c}>{c}</option>)}</select>
      </div>
      <table><thead><tr><th>Name</th><th>Class</th><th>State</th><th>Site</th><th>IP</th><th>Owner</th><th>Lifecycle</th><th>Warranty</th><th>Alerts</th></tr></thead><tbody>
        {cis.data?.map((c) => {
          const days = c.warranty_end ? Math.round((new Date(c.warranty_end).getTime() - Date.now()) / 86400000) : null;
          return <tr key={c.id} className="click" onClick={() => openCi(c.id)}>
            <td><b>{c.name}</b><div className="muted sm">{c.serial}</div></td><td>{c.ci_class}</td><td><Badge v={c.state} /></td><td className="sm">{c.site_name}</td><td className="mono sm">{c.ip}</td>
            <td className="sm">{c.account_name ?? <span className="muted">shared</span>}</td><td><Badge v={c.lifecycle === 'Deployed' ? 'ok' : 'warn'} text={c.lifecycle} /></td>
            <td className="sm">{days == null ? '–' : <Badge v={days < 0 ? 'crit' : days < 90 ? 'warn' : 'ok'} text={days < 0 ? 'expired' : `${days}d`} />}</td><td>{c.open_alerts || ''}</td></tr>;
        })}
      </tbody></table>
      {adding && <AddCi onClose={() => { setAdding(false); cis.reload(); }} />}
    </Card>
  );
}

function AddCi({ onClose }: { onClose: () => void }) {
  const meta = useApi<any>('/meta'); const sites = useApi<any[]>('/sites'); const accounts = useApi<any[]>('/accounts');
  const [f, setF] = useState<any>({ ci_class: 'Server', criticality: 'Medium', lifecycle: 'Deployed' });
  const [err, setErr] = useState('');
  const set = (k: string, v: any) => setF({ ...f, [k]: v === '' ? undefined : v });
  return <Modal title="Add configuration item" onClose={onClose}><div className="col">
    <div className="row"><label>Name<input onChange={(e) => set('name', e.target.value)} /></label><label>Class<select value={f.ci_class} onChange={(e) => set('ci_class', e.target.value)}>{meta.data?.ciClasses.map((c: string) => <option key={c}>{c}</option>)}</select></label></div>
    <div className="row"><label>Serial<input onChange={(e) => set('serial', e.target.value)} /></label><label>IP<input onChange={(e) => set('ip', e.target.value)} /></label><label>MAC<input onChange={(e) => set('mac', e.target.value)} /></label></div>
    <div className="row"><label>Site<select onChange={(e) => set('site_id', Number(e.target.value) || '')}><option value="">—</option>{sites.data?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
      <label>Owner account<select onChange={(e) => set('owner_account_id', Number(e.target.value) || '')}><option value="">shared</option>{accounts.data?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
      <label>Criticality<select value={f.criticality} onChange={(e) => set('criticality', e.target.value)}>{['Low', 'Medium', 'High', 'Critical'].map((c) => <option key={c}>{c}</option>)}</select></label></div>
    <div className="row"><label>Vendor<input onChange={(e) => set('vendor', e.target.value)} /></label><label>Warranty end<input type="date" onChange={(e) => set('warranty_end', e.target.value)} /></label>
      <label>Lifecycle<select value={f.lifecycle} onChange={(e) => set('lifecycle', e.target.value)}>{meta.data?.lifecycle.map((c: string) => <option key={c}>{c}</option>)}</select></label></div>
    <div className="muted sm">The class monitor template (SNMP/WMI/MQTT checks and thresholds) is applied automatically.</div>
    {err && <div style={{ color: 'var(--crit)' }}>{err}</div>}
    <button className="btn pri" onClick={async () => { try { await api('/cis', { body: f }); onClose(); } catch (e: any) { setErr(e.message); } }}>Create</button>
  </div></Modal>;
}

function CiDrawer({ id, onClose, openTicket, openCi }: { id: number; onClose: () => void; openTicket: (id: number) => void; openCi: (id: number) => void }) {
  const d = useApi<any>(`/cis/${id}`, { live: ['alert', 'ci.'] });
  const meta = useApi<any>('/meta');
  const [metric, setMetric] = useState('');
  const c = d.data;
  const m = metric || c?.checks.find((x: any) => x.metric !== 'availability' && x.metric !== 'service')?.metric || 'cpu';
  const series = useApi<any[]>(c ? `/cis/${id}/series?metric=${m}&minutes=90&bucket=60` : null, { live: ['telemetry'] , every: 20000 });
  if (!c) return <Drawer onClose={onClose}><Empty>Loading…</Empty></Drawer>;
  const days = (s: string) => Math.round((new Date(s).getTime() - Date.now()) / 86400000);
  return (
    <Drawer onClose={onClose}>
      <h2 style={{ margin: '0 0 4px' }}>{c.name}</h2>
      <div className="muted sm">{c.ci_class} · {c.site_name} · {c.account_name ?? 'shared infrastructure'} · serial {c.serial} <Badge v={c.state} /> <Badge v={c.criticality} /></div>
      <Card title="Lifecycle" right={<select value={c.lifecycle} onChange={async (e) => { await api(`/cis/${id}/lifecycle`, { body: { stage: e.target.value } }); d.reload(); }}>{meta.data?.lifecycle.map((s: string) => <option key={s}>{s}</option>)}</select>}>
        <div className="sm">{c.lifecycle_events.map((e: any) => <div key={e.id}>{fmtDate(e.at)}: {e.from_stage ?? '∅'} → <b>{e.to_stage}</b> <span className="muted">({e.actor})</span></div>)}</div>
        {c.lifecycle === 'Pending Review' && <button className="btn pri" style={{ marginTop: 6 }} onClick={async () => { await api(`/cis/${id}/lifecycle`, { body: { stage: 'Deployed' } }); d.reload(); }}>Approve → Deployed</button>}
      </Card>
      <Card title="Performance" right={<select value={m} onChange={(e) => setMetric(e.target.value)}>{c.checks.filter((x: any) => !['availability', 'service'].includes(x.metric)).map((x: any) => <option key={x.id}>{x.metric}</option>)}</select>}>
        <LineChart points={(series.data ?? []).map((p: any) => ({ t: p.t, avg: p.avg, max: p.max }))} unit="avg / max" />
      </Card>
      <Card title="Monitoring checks (thresholds)">
        <table><thead><tr><th>Metric</th><th>Proto</th><th>Warn</th><th>Crit</th><th></th></tr></thead><tbody>
          {c.checks.map((x: any) => <CheckRow key={x.id} ch={x} onSaved={d.reload} />)}
        </tbody></table>
      </Card>
      <Card title="Covered by contract">{c.contracts.length ? c.contracts.map((k: any) => <div key={k.id} className="sm"><b>{k.name}</b> · {k.policy} · ends {fmtDate(k.end_date)} <Badge v={k.status} /></div>) : <span className="muted sm">No active contract (alerts raise P4 + upsell opportunity)</span>}</Card>
      <Card title="Warranty">{c.warranties.length ? c.warranties.map((w: any) => <div key={w.id} className="sm">{w.vendor} {w.support_level} · ends {fmtDate(w.end_date)} <Badge v={days(w.end_date) < 0 ? 'crit' : days(w.end_date) < 90 ? 'warn' : 'ok'} text={days(w.end_date) < 0 ? 'expired' : `${days(w.end_date)} days`} /></div>) : <span className="muted sm">None recorded</span>}</Card>
      <Card title="Network / IPAM">{c.ips.map((i: any) => <div key={i.id} className="sm mono">{i.ip_text} <span className="muted">VLAN {i.vlan} {i.cidr} {i.mac}</span></div>)}{!c.ips.length && <span className="muted sm">No IP assigned</span>}</Card>
      <Card title="Relationships">
        <div className="sm"><b>Depends on</b>: {c.dependsOn.map((r: any) => <a key={r.id + r.rel_type} href="#" style={{ marginRight: 8 }} onClick={(e) => { e.preventDefault(); openCi(r.id); }}>{r.name} <span className="muted">({r.rel_type}{r.attrs?.port ? ' ' + r.attrs.port : ''})</span></a>)}{!c.dependsOn.length && '—'}</div>
        <div className="sm"><b>Dependents</b>: {c.dependents.map((r: any) => <a key={r.id + r.rel_type} href="#" style={{ marginRight: 8 }} onClick={(e) => { e.preventDefault(); openCi(r.id); }}>{r.name}</a>)}{!c.dependents.length && '—'}</div>
        <div className="sm" style={{ marginTop: 6 }}><b>Blast radius</b>: {c.impact.dependents.length} device(s) · customers: {c.impact.accounts.map((a: any) => a.name).join(', ') || 'none'}</div>
      </Card>
      <Card title="Alerts & tickets">
        {c.alerts.slice(0, 6).map((a: any) => <div key={a.id} className="sm"><SevBadge s={a.severity} /> {a.message} <span className="muted">{a.state} · {fmtTime(a.first_seen)}</span></div>)}
        {c.tickets.slice(0, 6).map((t: any) => <div key={t.id} className="sm"><a href="#" onClick={(e) => { e.preventDefault(); openTicket(t.id); }}>{t.number}</a> {t.subject.slice(0, 50)} <Badge v={t.status} /></div>)}
      </Card>
    </Drawer>
  );
}

function CheckRow({ ch, onSaved }: { ch: any; onSaved: () => void }) {
  const [w, setW] = useState(ch.warn ?? ''); const [c, setC] = useState(ch.crit ?? '');
  return <tr><td>{ch.metric}</td><td className="sm">{ch.protocol}</td>
    <td><input style={{ width: 60 }} value={w} onChange={(e) => setW(e.target.value)} /></td><td><input style={{ width: 60 }} value={c} onChange={(e) => setC(e.target.value)} /></td>
    <td><button className="btn" onClick={async () => { await api(`/checks/${ch.id}`, { method: 'PATCH', body: { warn: w === '' ? null : Number(w), crit: c === '' ? null : Number(c) } }); onSaved(); }}>Save</button></td></tr>;
}

function DepMap({ openCi }: { openCi: (id: number) => void }) {
  const sites = useApi<any[]>('/sites');
  const [site, setSite] = useState('');
  const topo = useApi<any>(`/topology${site ? `?site_id=${site}` : ''}`, { live: ['alert', 'ci.'] });
  const [sel, setSel] = useState<any>(null); const [impact, setImpact] = useState<any>(null);
  return (
    <Card title="Visual dependency map" right={<select value={site} onChange={(e) => { setSite(e.target.value); setSel(null); setImpact(null); }}><option value="">All sites</option>{sites.data?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>}>
      <div className="muted sm" style={{ marginBottom: 6 }}>Arrows read upward: a device depends on the devices above it. Click a node to see everything (and every customer) that would be affected if it fails. Dashed = WAN link.</div>
      {topo.data && <Topology nodes={topo.data.nodes} edges={topo.data.edges} selected={sel?.id} highlight={impact ? new Set([impact.ci_id, ...impact.dependents.map((d: any) => d.id)]) : null} onSelect={async (n) => { setSel(n); setImpact(await api(`/cis/${n.id}/impact`)); }} height={620} />}
      {sel && impact && <div style={{ marginTop: 10 }}>
        <h4 style={{ margin: '0 0 4px' }}>If <b>{sel.name}</b> fails <button className="btn" onClick={() => openCi(sel.id)}>details</button></h4>
        <div className="sm"><b>{impact.dependents.length}</b> device(s): {impact.dependents.map((d: any) => d.name).join(', ') || '—'}</div>
        <div className="sm"><b>{impact.accounts.length}</b> customer(s): {impact.accounts.map((a: any) => `${a.name} (${a.tier})`).join(', ') || '—'}</div>
      </div>}
    </Card>
  );
}

function Ipam() {
  const subs = useApi<any[]>('/ipam/subnets');
  const [sel, setSel] = useState<number | null>(null);
  const ips = useApi<any[]>(sel ? `/ipam/subnets/${sel}/ips` : null);
  const [msg, setMsg] = useState('');
  const [ip, setIp] = useState('');
  return <div className="grid g2">
    <Card title="Subnets">
      <table><thead><tr><th>CIDR</th><th>Name</th><th>VLAN</th><th>Utilisation</th></tr></thead><tbody>
        {subs.data?.map((s) => <tr key={s.id} className={`click ${sel === s.id ? 'sel' : ''}`} onClick={() => setSel(s.id)}><td className="mono">{s.cidr}</td><td>{s.name}</td><td>{s.vlan}</td>
          <td style={{ minWidth: 120 }}><div className="bar"><i style={{ width: `${Math.max(2, (100 * s.used) / s.total)}%` }} /></div><span className="sm muted">{s.used}/{s.total}</span></td></tr>)}
      </tbody></table>
    </Card>
    <Card title="Addresses" right={<span><input placeholder="reserve IP…" value={ip} onChange={(e) => setIp(e.target.value)} style={{ width: 130 }} /> <button className="btn" onClick={async () => { try { await api('/ipam/ips', { body: { ip, state: 'reserved' } }); setMsg('reserved'); setIp(''); ips.reload(); subs.reload(); } catch (e: any) { setMsg(e.message); } }}>Reserve</button></span>}>
      {msg && <div className="sm muted">{msg}</div>}
      {!sel ? <Empty>Select a subnet.</Empty> : <table><thead><tr><th>IP</th><th>State</th><th>Device</th><th>MAC</th></tr></thead><tbody>{ips.data?.map((i) => <tr key={i.id}><td className="mono">{i.ip}</td><td><Badge v={i.state === 'used' ? 'ok' : 'warn'} text={i.state} /></td><td>{i.ci_name ?? '–'}</td><td className="mono sm">{i.mac}</td></tr>)}</tbody></table>}
    </Card>
  </div>;
}

function Discovery({ openCi }: { openCi: (id: number) => void }) {
  const sites = useApi<any[]>('/sites');
  const pending = useApi<any[]>('/discovery/pending', { live: ['ci.'] });
  const [res, setRes] = useState<any>(null);
  return <div className="grid g2">
    <Card title="Auto-discovery">
      <p className="muted sm" style={{ marginTop: 0 }}>A Sub-DC collector sweeps its subnets (ICMP/ARP/SNMP/LLDP). Results are reconciled by serial → MAC → hostname; new devices become CIs in <b>Pending Review</b> with a monitor template. Unidentifiable devices raise a security ticket; an IP answered by two MACs raises a conflict incident. (Demo scan generates sample results.)</p>
      <div className="row">{sites.data?.map((s) => <button key={s.id} className="btn" onClick={async () => { setRes(await api('/discovery/scan', { body: { site_id: s.id } })); pending.reload(); }}>Scan {s.name}</button>)}</div>
      {res && <pre className="sm mono" style={{ background: 'var(--bg)', padding: 8, borderRadius: 6, overflow: 'auto' }}>{`created: ${res.created.length}  updated: ${res.updated.length}  conflicts: ${res.conflicts.length}  rogue: ${res.rogue.length}`}</pre>}
    </Card>
    <Card title="Pending review">
      <table><thead><tr><th>Device</th><th>Class</th><th>Site</th><th></th></tr></thead><tbody>{pending.data?.map((c) => <tr key={c.id}><td><a href="#" onClick={(e) => { e.preventDefault(); openCi(c.id); }}>{c.name}</a></td><td>{c.ci_class}</td><td className="sm">{c.site_name}</td>
        <td><button className="btn" disabled={c.ci_class === 'Unknown'} onClick={async () => { await api(`/cis/${c.id}/lifecycle`, { body: { stage: 'Deployed' } }); pending.reload(); }}>Approve</button> <button className="btn dng" onClick={async () => { await api(`/cis/${c.id}/lifecycle`, { body: { stage: 'Retired' } }); pending.reload(); }}>Reject</button></td></tr>)}</tbody></table>
      {!pending.data?.length && <Empty>Nothing pending.</Empty>}
    </Card>
  </div>;
}

function Maintenance() {
  const list = useApi<any[]>('/maintenance');
  const cis = useApi<any[]>('/cis');
  const [f, setF] = useState<any>({ name: 'Planned maintenance', suppress_alerts: true, pause_sla: false, minutes: 60 });
  return <div className="grid g2">
    <Card title="Schedule maintenance window"><div className="col">
      <label>Name<input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></label>
      <label>Device<select onChange={(e) => setF({ ...f, ci_id: Number(e.target.value) || undefined })}><option value="">—</option>{cis.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
      <label>Duration (minutes)<input type="number" value={f.minutes} onChange={(e) => setF({ ...f, minutes: Number(e.target.value) })} /></label>
      <label style={{ flexDirection: 'row', gap: 6 }}><input type="checkbox" checked={f.suppress_alerts} onChange={(e) => setF({ ...f, suppress_alerts: e.target.checked })} /> Suppress alerts (no tickets)</label>
      <label style={{ flexDirection: 'row', gap: 6 }}><input type="checkbox" checked={f.pause_sla} onChange={(e) => setF({ ...f, pause_sla: e.target.checked })} /> Pause SLA timers on tickets created in window</label>
      <button className="btn pri" disabled={!f.ci_id} onClick={async () => { const now = Date.now(); await api('/maintenance', { body: { ...f, start_at: new Date(now).toISOString(), end_at: new Date(now + f.minutes * 60000).toISOString() } }); list.reload(); }}>Start now</button>
    </div></Card>
    <Card title="Windows"><table><thead><tr><th>Name</th><th>Scope</th><th>Ends</th><th></th></tr></thead><tbody>{list.data?.map((m) => <tr key={m.id}><td>{m.name}</td><td>{m.ci_name ?? m.site_name}</td><td className="sm">{fmtDT(m.end_at)}</td><td><button className="btn dng" onClick={async () => { await api(`/maintenance/${m.id}`, { method: 'DELETE' }); list.reload(); }}>End</button></td></tr>)}</tbody></table></Card>
  </div>;
}

function Simulator() {
  const cis = useApi<any[]>('/cis');
  const cols = useApi<any[]>('/collectors', { live: ['collector', 'telemetry'], every: 5000 });
  const faults = useApi<any[]>('/sim/faults');
  const [ci, setCi] = useState(''); const [scn, setScn] = useState('down'); const [msg, setMsg] = useState('');
  const sel = cis.data?.find((c) => String(c.id) === ci);
  const scenarios: Record<string, [string, number | 'down']> = { down: ['availability', 'down'], cpu: ['cpu', 97], mem: ['mem', 88], disk: ['disk', 94], bandwidth: ['bandwidth', 93], temperature: ['temperature', 37], service: ['service', 0] };
  const inject = async () => {
    const [metric, value] = scenarios[scn];
    if (sel?.ci_class === 'IoT') { await api('/ingest/iot', { body: { ci_id: sel.id, topic: `plant/${sel.id}/${metric}`, value: value === 'down' ? 0 : value } }); setMsg('Sent MQTT-style telemetry'); }
    else { await api('/sim/fault', { body: { ci_id: Number(ci), metric, value } }); setMsg('Fault injected - the Sub-DC collector detects it within a few polls (needs 2-3 consecutive samples) and forwards the alert.'); }
    faults.reload();
  };
  return <div className="grid g2">
    <Card title="Fault injection (game day)">
      <div className="col">
        <label>Device<select value={ci} onChange={(e) => setCi(e.target.value)}><option value="">—</option>{cis.data?.filter((c) => c.lifecycle === 'Deployed').map((c) => <option key={c.id} value={c.id}>{c.name} ({c.ci_class})</option>)}</select></label>
        <label>Scenario<select value={scn} onChange={(e) => setScn(e.target.value)}><option value="down">Device down (unreachable)</option><option value="cpu">CPU 97%</option><option value="mem">Memory 88%</option><option value="disk">Disk 94%</option><option value="bandwidth">Bandwidth 93%</option><option value="temperature">Temperature 37°C (IoT)</option><option value="service">Service stopped (runbook R18 restarts it)</option></select></label>
        <div className="row"><button className="btn pri" disabled={!ci} onClick={inject}>Inject</button><button className="btn" disabled={!ci} onClick={async () => { await api('/sim/clear', { body: { ci_id: Number(ci) } }); if (sel?.ci_class === 'IoT') await api('/ingest/iot', { body: { ci_id: sel.id, topic: `plant/${sel.id}/temperature`, value: 22 } }); faults.reload(); setMsg('Cleared'); }}>Clear faults on device</button>
          <button className="btn" onClick={async () => { await api('/sim/flush', { body: {} }); setMsg('Collectors flushed'); }}>Force poll + flush</button></div>
        {msg && <div className="sm muted">{msg}</div>}
        <div className="sm">Active faults: {faults.data?.map((f) => `${cis.data?.find((c) => c.id === f.ci_id)?.name}:${f.metric}`).join(', ') || 'none'}</div>
      </div>
    </Card>
    <Card title="Sub-DC collectors & WAN">
      <table><thead><tr><th>Collector</th><th>Status</th><th>WAN</th><th>Queue</th><th>Saved</th><th></th></tr></thead><tbody>
        {cols.data?.map((c) => <tr key={c.id}><td>{c.name}<div className="muted sm">{c.site_name}</div></td><td><Badge v={c.status} /></td><td><Badge v={c.wan_up ? 'ok' : 'crit'} text={c.wan_up ? 'up' : 'cut'} /></td><td>{c.queue_depth}</td><td>{c.bandwidth_saved_pct}%</td>
          <td><button className={`btn ${c.wan_up ? 'dng' : 'pri'}`} onClick={async () => { await api(`/collectors/${c.id}/wan`, { body: { up: !c.wan_up } }); cols.reload(); }}>{c.wan_up ? 'Cut WAN' : 'Restore WAN'}</button></td></tr>)}
      </tbody></table>
      <p className="muted sm">Cut a Sub-DC's WAN: it keeps polling and alerting locally, buffers aggregated batches, and the Main DC marks the site's devices UNKNOWN (never DOWN) and raises a collector incident. Restoring the WAN replays the backlog in order.</p>
    </Card>
  </div>;
}
