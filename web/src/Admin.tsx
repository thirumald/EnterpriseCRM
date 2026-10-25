import { useState } from 'react';
import { api, useApi } from './api';
import { Badge, Card, fmtDT, fmtTime } from './ui';

export function Admin() {
  const [tab, setTab] = useState<'rules' | 'users' | 'sla' | 'activity' | 'notifications' | 'audit'>('rules');
  return <div>
    <div className="tabs">{(['rules', 'users', 'sla', 'activity', 'notifications', 'audit'] as const).map((t) => <button key={t} className={`tab ${tab === t ? 'on' : ''}`} onClick={() => setTab(t)}>{{ rules: 'Workflow rules', users: 'Users & access', sla: 'SLA policies', activity: 'Rule executions', notifications: 'Notifications', audit: 'Audit log' }[t]}</button>)}</div>
    {tab === 'rules' && <Rules />}{tab === 'users' && <Users />}{tab === 'sla' && <Sla />}{tab === 'activity' && <Exec />}{tab === 'notifications' && <Notes />}{tab === 'audit' && <Audit />}
  </div>;
}
function Rules() {
  const r = useApi<any[]>('/rules');
  return <Card title="Automated workflow rules (Alert → Ticket → SLA escalation)"><table><thead><tr><th>Code</th><th>Rule</th><th>Parameters</th><th>On</th></tr></thead><tbody>
    {r.data?.map((x) => <tr key={x.code}><td className="mono">{x.code}</td><td><b>{x.name}</b><div className="muted sm">{x.description}</div></td>
      <td>{Object.keys(x.params).length ? <ParamEditor rule={x} onSaved={r.reload} /> : <span className="muted sm">–</span>}</td>
      <td><input type="checkbox" checked={x.enabled} onChange={async (e) => { await api(`/rules/${x.code}`, { method: 'PATCH', body: { enabled: e.target.checked } }); r.reload(); }} /></td></tr>)}
  </tbody></table></Card>;
}
function ParamEditor({ rule, onSaved }: { rule: any; onSaved: () => void }) {
  const [v, setV] = useState(JSON.stringify(rule.params));
  const dirty = v !== JSON.stringify(rule.params);
  return <span><input className="mono sm" style={{ width: 220 }} value={v} onChange={(e) => setV(e.target.value)} />{dirty && <button className="btn" onClick={async () => { try { await api(`/rules/${rule.code}`, { method: 'PATCH', body: { params: JSON.parse(v) } }); onSaved(); } catch { alert('Invalid JSON'); } }}>Save</button>}</span>;
}
function Sla() {
  const p = useApi<any[]>('/sla/policies'); const c = useApi<any[]>('/sla/calendars');
  return <div className="col">
    {p.data?.map((x) => <Card key={x.id} title={`${x.name} · calendar: ${x.calendar_name}`}>
      <table><thead><tr><th>Priority</th><th>First response</th><th>Resolution</th><th>Clock</th></tr></thead><tbody>{Object.entries(x.targets).map(([k, v]: any) => <tr key={k}><td><Badge v={k} /></td><td>{v.response} min</td><td>{v.resolution >= 1440 ? `${(v.resolution / 60).toFixed(0)} h` : `${v.resolution} min`}</td><td>{v.clock}</td></tr>)}</tbody></table>
      <div className="muted sm">Warnings at {x.escalation.warn.join('% / ')}% · L2 {x.escalation.l2_after_min} min after breach · L3 {x.escalation.l3_after_min} min after breach (P1/P2)</div></Card>)}
    <Card title="Business calendars">{c.data?.map((x) => <div key={x.id} className="sm"><b>{x.name}</b> (UTC{x.utc_offset_min >= 0 ? '+' : ''}{x.utc_offset_min / 60}) · Mon–Fri {Math.floor(x.hours['1'][0] / 60)}:00–{Math.floor(x.hours['1'][1] / 60)}:00 · holidays: {x.holidays.join(', ') || 'none'}</div>)}</Card>
  </div>;
}
function Exec() {
  const e = useApi<any[]>('/rules-executions', { live: ['workflow'] });
  return <Card title="Rule executions"><table><thead><tr><th>Time</th><th>Rule</th><th>Trigger</th><th>Subject</th><th>Outcome</th></tr></thead><tbody>{e.data?.map((x) => <tr key={x.id}><td className="sm">{fmtTime(x.at)}</td><td><Badge v="info" text={x.rule_code} /></td><td className="sm">{x.trigger}</td><td>{x.subject}</td><td>{x.outcome}</td></tr>)}</tbody></table></Card>;
}
function Notes() {
  const n = useApi<any[]>('/notifications', { live: ['notification'] });
  return <Card title="Notifications dispatched (email / SMS / pager / voice adapters)"><table><thead><tr><th>Time</th><th>Channel</th><th>To</th><th>Subject</th></tr></thead><tbody>{n.data?.map((x) => <tr key={x.id}><td className="sm">{fmtTime(x.at)}</td><td><Badge v="default" text={x.channel} /></td><td>{x.recipient}</td><td>{x.subject}</td></tr>)}</tbody></table></Card>;
}
function Audit() {
  const a = useApi<any[]>('/audit');
  return <Card title="Audit log"><table><thead><tr><th>Time</th><th>Actor</th><th>Action</th><th>Entity</th></tr></thead><tbody>{a.data?.map((x) => <tr key={x.id}><td className="sm">{fmtDT(x.at)}</td><td>{x.actor}</td><td>{x.action}</td><td>{x.entity} {x.entity_id}</td></tr>)}</tbody></table></Card>;
}

const ROLES = ['admin', 'agent', 'engineer', 'account_manager', 'noc', 'customer'];
function Users() {
  const u = useApi<any[]>('/users'); const accounts = useApi<any[]>('/accounts');
  const [f, setF] = useState<any>({ role: 'agent' }); const [err, setErr] = useState('');
  return <div className="grid g2">
    <Card title="Create user"><div className="col">
      <label>Username<input value={f.username ?? ''} onChange={(e) => setF({ ...f, username: e.target.value })} /></label>
      <label>Display name<input value={f.display_name ?? ''} onChange={(e) => setF({ ...f, display_name: e.target.value })} /></label>
      <label>Password (min 8)<input type="password" value={f.password ?? ''} onChange={(e) => setF({ ...f, password: e.target.value })} /></label>
      <label>Role<select value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}>{ROLES.map((r) => <option key={r}>{r}</option>)}</select></label>
      {f.role === 'customer' && <label>Customer account<select onChange={(e) => setF({ ...f, account_id: Number(e.target.value) || null })}><option value="">—</option>{accounts.data?.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label>}
      {err && <div style={{ color: 'var(--crit)' }}>{err}</div>}
      <button className="btn pri" onClick={async () => { try { setErr(''); await api('/users', { body: f }); setF({ role: 'agent' }); u.reload(); } catch (e: any) { setErr(e.message); } }}>Create</button>
    </div></Card>
    <Card title="Users"><table><thead><tr><th>User</th><th>Role</th><th>Last login</th><th></th></tr></thead><tbody>
      {u.data?.map((x) => <tr key={x.id} style={{ opacity: x.active ? 1 : 0.5 }}><td><b>{x.username}</b><div className="muted sm">{x.display_name}{x.account_name ? ` · ${x.account_name}` : ''}</div></td><td><Badge v="info" text={x.role} /></td><td className="sm">{fmtDT(x.last_login)}</td>
        <td style={{ whiteSpace: 'nowrap' }}><button className="btn" onClick={async () => { const p = prompt('New password (min 8 characters)'); if (p) { try { await api(`/users/${x.id}`, { method: 'PATCH', body: { password: p } }); } catch (e: any) { alert(e.message); } } }}>Reset pw</button>{' '}
          <button className={`btn ${x.active ? 'dng' : ''}`} onClick={async () => { await api(`/users/${x.id}`, { method: 'PATCH', body: { active: !x.active } }); u.reload(); }}>{x.active ? 'Disable' : 'Enable'}</button></td></tr>)}
    </tbody></table></Card>
  </div>;
}
