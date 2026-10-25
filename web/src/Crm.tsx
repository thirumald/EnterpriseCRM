import { useState } from 'react';
import { api, useApi } from './api';
import { Badge, Card, Empty, fmtDate, fmtDT, Modal, money, SevBadge, Tile } from './ui';

const STAGES = ['Prospect', 'Qualified', 'Proposal', 'Negotiation', 'Won', 'Lost'];

export function Crm({ initial, openTicket, openCi }: { initial?: number | null; openTicket: (id: number) => void; openCi: (id: number) => void }) {
  const [sel, setSel] = useState<number | null>(initial ?? null);
  const [tab, setTab] = useState<'accounts' | 'pipeline' | 'renewals' | 'sla'>('accounts');
  return <div>
    <div className="tabs">{(['accounts', 'pipeline', 'renewals', 'sla'] as const).map((t) => <button key={t} className={`tab ${tab === t ? 'on' : ''}`} onClick={() => { setTab(t); setSel(null); }}>{{ accounts: 'Accounts', pipeline: 'Pipeline', renewals: 'Renewals & warranties', sla: 'SLA report' }[t]}</button>)}</div>
    {tab === 'accounts' && (sel ? <Account360 id={sel} back={() => setSel(null)} openTicket={openTicket} openCi={openCi} /> : <Accounts onOpen={setSel} />)}
    {tab === 'pipeline' && <Pipeline />}
    {tab === 'renewals' && <Renewals openCi={openCi} onOpen={(id) => { setTab('accounts'); setSel(id); }} />}
    {tab === 'sla' && <SlaReport onOpen={(id) => { setTab('accounts'); setSel(id); }} />}
  </div>;
}

function Accounts({ onOpen }: { onOpen: (id: number) => void }) {
  const list = useApi<any[]>('/accounts', { live: ['account', 'ticket'] });
  const [adding, setAdding] = useState(false);
  const [f, setF] = useState<any>({ tier: 'Silver' });
  return <Card title="Customer accounts" right={<button className="btn pri" onClick={() => setAdding(true)}>+ Account</button>}>
    <table><thead><tr><th>Account</th><th>Tier</th><th>Owner</th><th>Health</th><th>Open tickets</th><th>Assets</th><th>Contract value</th><th>Renewal</th></tr></thead><tbody>
      {list.data?.map((a) => <tr key={a.id} className="click" onClick={() => onOpen(a.id)}><td><b>{a.name}</b><div className="muted sm">{a.industry}</div></td><td><Badge v={a.tier} /></td><td className="sm">{a.owner}</td>
        <td style={{ minWidth: 110 }}><div className="bar"><i style={{ width: `${a.health_score}%`, background: a.health_score < 60 ? 'var(--crit)' : a.health_score < 80 ? 'var(--warn)' : 'var(--ok)' }} /></div><span className="sm">{a.health_score}</span></td>
        <td>{a.open_tickets}</td><td>{a.assets}</td><td>{money(a.contract_value)}</td><td className="sm">{fmtDate(a.contract_end)}</td></tr>)}
    </tbody></table>
    {adding && <Modal title="New account" onClose={() => setAdding(false)}><div className="col">
      <label>Name<input onChange={(e) => setF({ ...f, name: e.target.value })} /></label>
      <div className="row"><label>Tier<select value={f.tier} onChange={(e) => setF({ ...f, tier: e.target.value })}>{['Platinum', 'Gold', 'Silver', 'Bronze'].map((t) => <option key={t}>{t}</option>)}</select></label><label>Industry<input onChange={(e) => setF({ ...f, industry: e.target.value })} /></label></div>
      <div className="row"><label>Owner<input onChange={(e) => setF({ ...f, owner: e.target.value })} /></label><label>Email domain<input placeholder="customer.com" onChange={(e) => setF({ ...f, email_domain: e.target.value })} /></label></div>
      <button className="btn pri" onClick={async () => { await api('/accounts', { body: f }); setAdding(false); list.reload(); }}>Create</button></div></Modal>}
  </Card>;
}

function Account360({ id, back, openTicket, openCi }: { id: number; back: () => void; openTicket: (id: number) => void; openCi: (id: number) => void }) {
  const d = useApi<any>(`/accounts/${id}`, { live: ['alert', 'ticket', 'account', 'sla'] });
  const [note, setNote] = useState('');
  const [newContract, setNewContract] = useState(false);
  if (!d.data) return <Empty>Loading…</Empty>;
  const { account: a, contacts, contracts, assets, tickets, alerts, opportunities, activities, stats } = d.data;
  const openT = tickets.filter((t: any) => !['Resolved', 'Closed'].includes(t.status));
  return <div className="col">
    <div className="row" style={{ alignItems: 'center' }}><button className="btn" onClick={back}>← Accounts</button><h2 style={{ margin: 0 }}>{a.name}</h2><Badge v={a.tier} /><span className="muted">{a.industry} · owner {a.owner}</span></div>
    <div className="grid g6">
      <Tile label="Health score" value={a.health_score} tone={a.health_score < 60 ? 'crit' : a.health_score < 80 ? 'warn' : 'ok'} />
      <Tile label="SLA attainment (30d)" value={`${stats.sla_attainment}%`} tone={stats.sla_attainment < 95 ? 'warn' : 'ok'} />
      <Tile label="Open tickets" value={openT.length} tone={openT.some((t: any) => t.priority === 'P1') ? 'crit' : undefined} />
      <Tile label="Active alerts" value={alerts.length} tone={alerts.length ? 'warn' : 'ok'} />
      <Tile label="Assets" value={assets.length} />
      <Tile label="CSAT" value={stats.csat_avg ?? '–'} />
    </div>
    <div className="grid g2">
      <Card title="Contracts & entitlements" right={<button className="btn" onClick={() => setNewContract(true)}>+ Contract</button>}>
        <table><thead><tr><th>Contract</th><th>SLA</th><th>Covers</th><th>Ends</th><th>Value</th></tr></thead><tbody>{contracts.map((c: any) => <tr key={c.id}><td>{c.name}</td><td><Badge v={c.policy_tier} /></td><td>{c.covered_assets} assets</td><td className="sm">{fmtDate(c.end_date)}</td><td>{money(c.value)}</td></tr>)}</tbody></table>
        {!contracts.length && <Empty>No contracts – tickets get no SLA.</Empty>}
      </Card>
      <Card title="Live infrastructure alerts (linked from monitoring)">
        {alerts.map((al: any) => <div key={al.id} className="sm" style={{ padding: '3px 0' }}><SevBadge s={al.severity} /> <a href="#" onClick={(e) => { e.preventDefault(); openCi(al.ci_id); }}>{al.ci_name}</a> {al.message} {al.ticket_id && <a href="#" onClick={(e) => { e.preventDefault(); openTicket(al.ticket_id); }}>ticket</a>}</div>)}
        {!alerts.length && <Empty>All monitored services healthy ✓</Empty>}
      </Card>
    </div>
    <Card title="Assets & coverage">
      <table><thead><tr><th>Asset</th><th>Class</th><th>Site</th><th>State</th><th>Criticality</th><th>Contract</th><th>Warranty ends</th></tr></thead><tbody>
        {assets.map((x: any) => <tr key={x.id} className="click" onClick={() => openCi(x.id)}><td>{x.name}</td><td>{x.ci_class}</td><td className="sm">{x.site}</td><td><Badge v={x.state} /></td><td>{x.criticality}</td><td>{x.covered ? <Badge v="ok" text="covered" /> : <Badge v="warn" text="uncovered" />}</td><td className="sm">{fmtDate(x.warranty_end)}</td></tr>)}
      </tbody></table>
    </Card>
    <div className="grid g2">
      <Card title="Tickets"><table><tbody>{tickets.slice(0, 12).map((t: any) => <tr key={t.id} className="click" onClick={() => openTicket(t.id)}><td className="mono sm">{t.number}</td><td><Badge v={t.priority} /></td><td>{t.subject.slice(0, 44)}</td><td><Badge v={t.status} /></td>{t.sla_breached && <td><Badge v="breached" text="breach" /></td>}</tr>)}</tbody></table></Card>
      <Card title="Opportunities"><table><tbody>{opportunities.map((o: any) => <tr key={o.id}><td>{o.name}<div className="muted sm">{o.source}</div></td><td><Badge v="info" text={o.stage} /></td><td>{money(o.amount)}</td><td className="sm">{fmtDate(o.close_date)}</td></tr>)}</tbody></table></Card>
    </div>
    <div className="grid g2">
      <Card title="Contacts">{contacts.map((c: any) => <div key={c.id} className="sm">{c.name} · {c.role} · {c.email}</div>)}</Card>
      <Card title="Activity log" right={<span><input placeholder="log a note / call…" value={note} onChange={(e) => setNote(e.target.value)} /> <button className="btn" disabled={!note} onClick={async () => { await api(`/accounts/${id}/activities`, { body: { kind: 'note', note } }); setNote(''); d.reload(); }}>Add</button></span>}>
        {activities.map((x: any) => <div key={x.id} className="sm" style={{ padding: '3px 0' }}><Badge v={x.kind === 'renewal_risk' ? 'crit' : x.kind === 'upsell' ? 'ok' : 'info'} text={x.kind} /> {x.note} <span className="muted">· {x.actor} · {fmtDT(x.at)}</span></div>)}
      </Card>
    </div>
    {newContract && <NewContract accountId={id} assets={assets} onClose={() => { setNewContract(false); d.reload(); }} />}
  </div>;
}

function NewContract({ accountId, assets, onClose }: { accountId: number; assets: any[]; onClose: () => void }) {
  const pol = useApi<any[]>('/sla/policies');
  const [f, setF] = useState<any>({ account_id: accountId, name: 'New support contract', start_date: new Date().toISOString().slice(0, 10), end_date: new Date(Date.now() + 365 * 86400000).toISOString().slice(0, 10), value: 50000, ci_ids: [] });
  return <Modal title="New contract" onClose={onClose}><div className="col">
    <label>Name<input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></label>
    <div className="row"><label>SLA policy<select onChange={(e) => setF({ ...f, sla_policy_id: Number(e.target.value) })}><option value="">—</option>{pol.data?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label><label>Value<input type="number" value={f.value} onChange={(e) => setF({ ...f, value: Number(e.target.value) })} /></label></div>
    <div className="row"><label>Start<input type="date" value={f.start_date} onChange={(e) => setF({ ...f, start_date: e.target.value })} /></label><label>End<input type="date" value={f.end_date} onChange={(e) => setF({ ...f, end_date: e.target.value })} /></label></div>
    <div className="sm muted">Covered assets</div>
    <div style={{ maxHeight: 160, overflow: 'auto' }}>{assets.map((x) => <label key={x.id} style={{ flexDirection: 'row', gap: 6 }}><input type="checkbox" onChange={(e) => setF({ ...f, ci_ids: e.target.checked ? [...f.ci_ids, x.id] : f.ci_ids.filter((i: number) => i !== x.id) })} />{x.name}</label>)}</div>
    <button className="btn pri" disabled={!f.sla_policy_id} onClick={async () => { await api('/contracts', { body: f }); onClose(); }}>Create</button>
  </div></Modal>;
}

function Pipeline() {
  const opps = useApi<any[]>('/opportunities');
  const rep = useApi<any[]>('/reports/pipeline');
  return <div className="col">
    <div className="grid g6">{rep.data?.map((r) => <Tile key={r.stage} label={`${r.stage} (${r.n})`} value={money(r.amount)} />)}</div>
    <div className="grid" style={{ gridTemplateColumns: `repeat(${STAGES.length},minmax(150px,1fr))`, overflow: 'auto' }}>
      {STAGES.map((s) => <Card key={s} title={s}>{opps.data?.filter((o) => o.stage === s).map((o) => <div key={o.id} className="card" style={{ background: 'var(--panel2)', marginBottom: 8 }}>
        <b className="sm">{o.name}</b><div className="muted sm">{o.account_name} · {o.source}</div><div>{money(o.amount)}</div>
        <select value={o.stage} onChange={async (e) => { await api(`/opportunities/${o.id}`, { method: 'PATCH', body: { stage: e.target.value } }); opps.reload(); rep.reload(); }}>{STAGES.map((x) => <option key={x}>{x}</option>)}</select></div>)}</Card>)}
    </div>
  </div>;
}

function Renewals({ openCi, onOpen }: { openCi: (id: number) => void; onOpen: (id: number) => void }) {
  const con = useApi<any[]>('/contracts'); const war = useApi<any[]>('/warranties?within_days=365');
  const days = (s: string) => Math.round((new Date(s).getTime() - Date.now()) / 86400000);
  return <div className="grid g2">
    <Card title="Contract renewals"><table><thead><tr><th>Account</th><th>Contract</th><th>Ends</th><th>Value</th></tr></thead><tbody>{con.data?.map((c) => <tr key={c.id} className="click" onClick={() => onOpen(c.account_id)}><td>{c.account_name}</td><td>{c.name}</td><td><Badge v={days(c.end_date) < 60 ? 'crit' : days(c.end_date) < 120 ? 'warn' : 'ok'} text={`${days(c.end_date)}d`} /></td><td>{money(c.value)}</td></tr>)}</tbody></table></Card>
    <Card title="Warranties expiring ≤ 12 months"><table><thead><tr><th>Asset</th><th>Account</th><th>Ends</th></tr></thead><tbody>{war.data?.map((w) => <tr key={w.id} className="click" onClick={() => openCi(w.ci_id)}><td>{w.ci_name}</td><td className="sm">{w.account_name ?? 'shared'}</td><td><Badge v={w.days_left < 0 ? 'crit' : w.days_left < 90 ? 'warn' : 'ok'} text={w.days_left < 0 ? 'expired' : `${w.days_left}d`} /> {w.renewal_flagged && <Badge v="info" text="opp created" />}</td></tr>)}</tbody></table></Card>
  </div>;
}

function SlaReport({ onOpen }: { onOpen: (id: number) => void }) {
  const r = useApi<any[]>('/reports/sla');
  return <Card title="SLA attainment by account (last 30 days)"><table><thead><tr><th>Account</th><th>Tier</th><th>Tickets</th><th>Breached</th><th>Attainment</th><th>MTTR</th></tr></thead><tbody>
    {r.data?.map((x) => <tr key={x.account_id} className="click" onClick={() => onOpen(x.account_id)}><td>{x.account}</td><td><Badge v={x.tier} /></td><td>{x.tickets}</td><td>{x.breached}</td><td><Badge v={x.attainment >= 95 ? 'ok' : x.attainment >= 85 ? 'warn' : 'crit'} text={`${x.attainment}%`} /></td><td>{x.mttr_min != null ? `${x.mttr_min}m` : '–'}</td></tr>)}</tbody></table></Card>;
}
