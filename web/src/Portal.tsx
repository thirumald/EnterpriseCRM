import { useState } from 'react';
import { api, useApi } from './api';
import { Badge, Card, Empty, fmtDT, Sla } from './ui';

/** Customer self-service portal: scoped to one account's tickets and assets. */
export function Portal() {
  const accounts = useApi<any[]>('/accounts');
  const [aid, setAid] = useState<number | null>(null);
  const acc = useApi<any>(aid ? `/accounts/${aid}` : null, { live: ['ticket', 'alert', 'sla'] });
  const [f, setF] = useState<any>({ subject: '', description: '', ci_id: '' });
  const [msg, setMsg] = useState('');
  const d = aid ? acc.data : undefined;
  return <div className="col">
    <Card title="Customer portal (preview)"><label>Sign in as account<select value={aid ?? ''} onChange={(e) => setAid(Number(e.target.value) || null)}><option value="">— choose a customer —</option>{accounts.data?.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label></Card>
    {d && <div className="grid g2">
      <Card title="Raise a request">
        <div className="col"><label>What do you need help with?<input value={f.subject} onChange={(e) => setF({ ...f, subject: e.target.value })} /></label>
          <label>Affected asset<select value={f.ci_id} onChange={(e) => setF({ ...f, ci_id: e.target.value })}><option value="">Not sure</option>{d.assets.map((x: any) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
          <label>Details<textarea value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></label>
          <button className="btn pri" disabled={!f.subject} onClick={async () => { const t = await api('/tickets', { body: { subject: f.subject, description: f.description, ci_id: f.ci_id ? Number(f.ci_id) : null, account_id: aid, contact_id: d.contacts[0]?.id, channel: 'portal', priority: 'P3' } }); setMsg(`Created ${t.number}`); setF({ subject: '', description: '', ci_id: '' }); acc.reload(); }}>Submit</button>
          {msg && <div className="sm" style={{ color: 'var(--ok)' }}>{msg}</div>}</div>
      </Card>
      <Card title="Service status">
        {d.assets.map((x: any) => <div key={x.id} className="sm" style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}><span>{x.name}</span><Badge v={x.state} /></div>)}
        <div className="muted sm" style={{ marginTop: 8 }}>SLA attainment (30d): <b>{d.stats.sla_attainment}%</b></div>
      </Card>
      <Card title="My tickets" className="g2x"><table><thead><tr><th>#</th><th>Subject</th><th>Status</th><th>Updated</th></tr></thead><tbody>{d.tickets.map((t: any) => <tr key={t.id}><td className="mono sm">{t.number}</td><td>{t.subject}</td><td><Badge v={t.status} /></td><td className="sm">{fmtDT(t.created_at)}</td></tr>)}</tbody></table>{!d.tickets.length && <Empty>No tickets yet.</Empty>}</Card>
    </div>}
  </div>;
}
void Sla;
