import { useEffect, useState } from 'react';
import { api, useApi } from './api';
import { Badge, Card, Empty, fmtDT, Modal, SevBadge, Sla } from './ui';

const FILTERS: [string, string][] = [['mine', 'My queue'], ['active', 'All active'], ['breached', 'SLA breached'], ['unassigned', 'Unassigned'], ['P1', 'P1 only'], ['closed', 'Closed']];

export function Agent({ me, initial, openAccount, openCi }: { me: string; initial?: number | null; openAccount: (id: number) => void; openCi: (id: number) => void }) {
  const [filter, setFilter] = useState('mine');
  const [text, setText] = useState('');
  const [sel, setSel] = useState<number | null>(initial ?? null);
  const [creating, setCreating] = useState(false);
  const [emailSim, setEmailSim] = useState(false);
  useEffect(() => { if (initial) setSel(initial); }, [initial]);
  const qs = (() => {
    const p = new URLSearchParams();
    if (filter === 'mine') { p.set('status', 'active'); p.set('assignee', me); }
    else if (filter === 'active') p.set('status', 'active');
    else if (filter === 'breached') { p.set('status', 'active'); p.set('breached', 'true'); }
    else if (filter === 'P1') { p.set('status', 'active'); p.set('priority', 'P1'); }
    else if (filter === 'closed') p.set('status', 'Closed');
    if (text) p.set('q', text);
    return p.toString();
  })();
  const list = useApi<any[]>(`/tickets?${qs}`, { live: ['ticket', 'sla'] });
  const rows = (list.data ?? []).filter((t) => filter !== 'unassigned' || (!t.assignee && !['Resolved', 'Closed'].includes(t.status)));
  return (
    <div className="grid" style={{ gridTemplateColumns: 'minmax(0,1fr) minmax(0,1.5fr)' }}>
      <Card title="Help Desk queue" right={<span style={{ display: 'flex', gap: 6 }}><button className="btn" onClick={() => setEmailSim(true)}>✉ Simulate email</button><button className="btn pri" onClick={() => setCreating(true)}>+ New ticket</button></span>}>
        <div className="row" style={{ marginBottom: 8, gap: 6 }}>
          {FILTERS.map(([k, l]) => <button key={k} className={`btn ${filter === k ? 'pri' : ''}`} onClick={() => setFilter(k)}>{l}</button>)}
          <input placeholder="search…" value={text} onChange={(e) => setText(e.target.value)} style={{ flex: 1, minWidth: 100 }} />
        </div>
        <table><thead><tr><th>#</th><th>Pri</th><th>Subject / Account</th><th>Status</th><th>SLA</th></tr></thead><tbody>
          {rows.map((t) => (
            <tr key={t.id} className={`click ${sel === t.id ? 'sel' : ''}`} onClick={() => setSel(t.id)}>
              <td className="mono sm">{t.number.replace('INC-', '')}<div className="muted">{t.channel}</div></td>
              <td><Badge v={t.priority} /></td>
              <td>{t.subject.slice(0, 54)}<div className="muted sm">{t.account_name ?? 'no account'} · {t.assignee ?? 'unassigned'}</div></td>
              <td><Badge v={t.status} /></td>
              <td><div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}><Sla due={t.response_due} state={t.response_state} label="resp" /><Sla due={t.resolution_due} state={t.resolution_state} label="res" /></div></td>
            </tr>
          ))}
        </tbody></table>
        {!rows.length && <Empty>No tickets in this view.</Empty>}
      </Card>
      {sel ? <TicketDetail id={sel} me={me} openAccount={openAccount} openCi={openCi} onSelect={setSel} /> : <Card><Empty>Select a ticket to see details, SLA clocks, linked asset and monitoring alerts.</Empty></Card>}
      {creating && <NewTicket onClose={() => setCreating(false)} onCreated={(t) => { setCreating(false); setSel(t.id); list.reload(); }} />}
      {emailSim && <EmailSim onClose={() => setEmailSim(false)} onDone={(r) => { setEmailSim(false); setSel(r.ticket.id); list.reload(); }} />}
    </div>
  );
}

export function TicketDetail({ id, me, openAccount, openCi, onSelect }: { id: number; me: string; openAccount: (id: number) => void; openCi: (id: number) => void; onSelect: (id: number) => void }) {
  const t = useApi<any>(`/tickets/${id}`, { live: ['ticket', 'sla', 'alert'] });
  const meta = useApi<any>('/meta');
  const [body, setBody] = useState('');
  const [kind, setKind] = useState<'agent' | 'note'>('agent');
  const [err, setErr] = useState('');
  const d = t.data;
  if (!d) return <Card><Empty>Loading…</Empty></Card>;
  const act = async (fn: () => Promise<any>) => { try { setErr(''); await fn(); t.reload(); } catch (e: any) { setErr(e.message); } };
  const closed = ['Resolved', 'Closed'].includes(d.status);
  return (
    <div className="col">
      <Card title={<span>{d.number} · {d.type}</span>} right={<span style={{ display: 'flex', gap: 6 }}><Badge v={d.priority} /><Badge v={d.status} />{d.sla_breached && <Badge v="breached" text="SLA BREACHED" />}{d.escalation_level > 0 && <Badge v="crit" text={`ESC L${d.escalation_level}`} />}</span>}>
        <h2 style={{ margin: '0 0 6px', fontSize: 18 }}>{d.subject}</h2>
        <div className="muted sm" style={{ marginBottom: 8 }}>via {d.channel} · opened {fmtDT(d.created_at)} · queue {d.queue} · assignee {d.assignee ?? 'unassigned'} {d.repeat_count > 1 && <Badge v="warn" text={`${d.repeat_count} repeats`} />}</div>
        {d.description && <p style={{ whiteSpace: 'pre-wrap', margin: '0 0 8px' }}>{d.description}</p>}
        <div className="row" style={{ marginBottom: 8 }}>
          {d.timers.map((x: any) => <Sla key={x.id} due={x.due_at} state={x.state} label={x.kind === 'response' ? 'Response' : 'Resolution'} />)}
          {d.timers.length === 0 && <span className="muted sm">No SLA (no active contract)</span>}
          {d.timers[0] && <span className="muted sm">{d.timers[0].clock === '24x7' ? '24x7 clock' : 'business-hours clock'} · pauses on Waiting on Customer / On Hold</span>}
        </div>
        <div className="row" style={{ gap: 6 }}>
          {d.status === 'New' && <button className="btn pri" onClick={() => act(() => api(`/tickets/${id}/ack`, { method: 'POST', body: {} }))}>Acknowledge</button>}
          <select value={d.status} onChange={(e) => act(() => api(`/tickets/${id}/status`, { body: { status: e.target.value } }))}>{meta.data?.statuses.map((s: string) => <option key={s}>{s}</option>)}</select>
          <select value={d.priority} onChange={(e) => act(() => api(`/tickets/${id}/priority`, { body: { priority: e.target.value } }))}>{['P1', 'P2', 'P3', 'P4'].map((s) => <option key={s}>{s}</option>)}</select>
          <select value={d.assignee ?? ''} onChange={(e) => act(() => api(`/tickets/${id}/assign`, { body: { assignee: e.target.value } }))}>
            <option value="">unassigned</option>{Object.entries(meta.data?.agents ?? {}).map(([q, a]: any) => <optgroup key={q} label={q}>{a.map((x: string) => <option key={x}>{x}</option>)}</optgroup>)}
          </select>
          {!closed && <button className="btn" onClick={() => act(() => api(`/tickets/${id}/status`, { body: { status: 'Resolved' } }))}>Resolve</button>}
          {d.status === 'Resolved' && <button className="btn" onClick={() => { const s = prompt('CSAT 1-5 (customer survey)'); if (s) act(() => api(`/tickets/${id}/csat`, { body: { score: Number(s) } })); }}>Record CSAT</button>}
        </div>
        {err && <div style={{ color: 'var(--crit)' }}>{err}</div>}
      </Card>
      <div className="grid g2">
        <Card title="Customer & contract">
          {d.account_name ? <>
            <div><a href="#" onClick={(e) => { e.preventDefault(); openAccount(d.account_id); }}><b>{d.account_name}</b></a> <Badge v={d.account_tier} /></div>
            <div className="sm muted">{d.contact_name ? `${d.contact_name} <${d.contact_email}>` : 'no contact'}</div>
            <div className="sm">Contract: <b>{d.contract_name ?? 'none (no SLA)'}</b></div>
          </> : <span className="muted">{d.channel === 'alert' ? 'Shared-infrastructure incident – each affected customer gets an impact ticket with its own contract SLA' : 'Unmatched sender – needs triage'}</span>}
          {d.parent_ticket_id && <div className="sm">Child of ticket #{d.parent_ticket_id} <a href="#" onClick={(e) => { e.preventDefault(); onSelect(d.parent_ticket_id); }}>open</a></div>}
          {d.children.length > 0 && <div className="sm" style={{ marginTop: 6 }}>Impact tickets: {d.children.map((c: any) => <a key={c.id} href="#" style={{ marginRight: 6 }} onClick={(e) => { e.preventDefault(); onSelect(c.id); }}>{c.number}</a>)}</div>}
        </Card>
        <Card title="Linked asset & monitoring">
          {d.ci_id ? <>
            <div><a href="#" onClick={(e) => { e.preventDefault(); openCi(d.ci_id); }}><b>{d.ci_name}</b></a> <span className="muted">{d.ci_class}</span> <Badge v={d.ci_criticality} /></div>
            {d.alerts.map((a: any) => <div key={a.id} className="sm" style={{ marginTop: 4 }}><SevBadge s={a.severity} /> {a.message} <span className="muted">({a.state}{a.repeat_count > 1 ? `, ×${a.repeat_count}` : ''})</span></div>)}
            {d.related.length > 0 && <div className="sm muted" style={{ marginTop: 6 }}>History: {d.related.map((r: any) => `${r.number} (${r.status})`).join(', ')}</div>}
          </> : <span className="muted">No asset linked</span>}
        </Card>
      </div>
      <Card title="Timeline">
        <div className="tl">{d.events.map((e: any) => (
          <div key={e.id} className={`ev ${e.type}`}><div className="sm"><b>{e.actor}</b> <span className="muted">· {e.type.replace('_', ' ')} · {fmtDT(e.at)}</span></div><div style={{ whiteSpace: 'pre-wrap' }}>{e.body}</div></div>
        ))}</div>
        {!closed && <div style={{ marginTop: 12 }}>
          <textarea placeholder={kind === 'agent' ? 'Reply to customer…' : 'Internal note…'} value={body} onChange={(e) => setBody(e.target.value)} />
          <div className="row" style={{ marginTop: 6 }}>
            <select value={kind} onChange={(e) => setKind(e.target.value as any)}><option value="agent">Public reply</option><option value="note">Internal note</option></select>
            <button className="btn pri" disabled={!body.trim()} onClick={() => act(async () => { await api(`/tickets/${id}/reply`, { body: { kind, body } }); setBody(''); })}>Send</button>
            <button className="btn" disabled={!body.trim()} onClick={() => act(async () => { await api(`/tickets/${id}/reply`, { body: { kind: 'customer', body } }); setBody(''); })}>Simulate customer reply</button>
          </div>
        </div>}
      </Card>
      {d.kb.length > 0 && <Card title="Suggested knowledge">{d.kb.map((k: any) => <div key={k.id} className="sm">📘 {k.title}</div>)}</Card>}
    </div>
  );
}

function NewTicket({ onClose, onCreated }: { onClose: () => void; onCreated: (t: any) => void }) {
  const accounts = useApi<any[]>('/accounts');
  const [f, setF] = useState<any>({ channel: 'phone', urgency: 'medium', impact: 'single', type: 'Incident' });
  const cis = useApi<any[]>(f.account_id ? `/cis?account_id=${f.account_id}` : null);
  const contacts = useApi<any>(f.account_id ? `/accounts/${f.account_id}` : null);
  const [err, setErr] = useState('');
  const set = (k: string, v: any) => setF((x: any) => ({ ...x, [k]: v }));
  return (
    <Modal title="New ticket" onClose={onClose}>
      <div className="col">
        <label>Subject<input value={f.subject ?? ''} onChange={(e) => set('subject', e.target.value)} /></label>
        <div className="row">
          <label>Account<select value={f.account_id ?? ''} onChange={(e) => set('account_id', e.target.value ? Number(e.target.value) : null)}><option value="">— none —</option>{accounts.data?.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
          <label>Contact<select value={f.contact_id ?? ''} onChange={(e) => set('contact_id', e.target.value ? Number(e.target.value) : null)}><option value="">—</option>{contacts.data?.contacts.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
          <label>Asset<select value={f.ci_id ?? ''} onChange={(e) => set('ci_id', e.target.value ? Number(e.target.value) : null)}><option value="">—</option>{cis.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
        </div>
        <div className="row">
          <label>Channel<select value={f.channel} onChange={(e) => set('channel', e.target.value)}>{['phone', 'portal', 'email', 'chat', 'api'].map((c) => <option key={c}>{c}</option>)}</select></label>
          <label>Type<select value={f.type} onChange={(e) => set('type', e.target.value)}>{['Incident', 'Service Request', 'Problem', 'Change', 'Task'].map((c) => <option key={c}>{c}</option>)}</select></label>
          <label>Urgency<select value={f.urgency} onChange={(e) => set('urgency', e.target.value)}>{['immediate', 'high', 'medium', 'low'].map((c) => <option key={c}>{c}</option>)}</select></label>
          <label>Impact<select value={f.impact} onChange={(e) => set('impact', e.target.value)}><option value="many">many customers / site</option><option value="service">a customer service</option><option value="single">single user/device</option></select></label>
        </div>
        <label>Description<textarea value={f.description ?? ''} onChange={(e) => set('description', e.target.value)} /></label>
        {err && <div style={{ color: 'var(--crit)' }}>{err}</div>}
        <button className="btn pri" onClick={async () => { try { onCreated(await api('/tickets', { body: f })); } catch (e: any) { setErr(e.message); } }}>Create (priority from matrix)</button>
      </div>
    </Modal>
  );
}

function EmailSim({ onClose, onDone }: { onClose: () => void; onDone: (r: any) => void }) {
  const [f, setF] = useState({ from: 'wendy@acme.example', subject: 'Cannot reach MES dashboard', body: 'The plant dashboard shows a timeout since this morning.' });
  return (
    <Modal title="Inbound email (intake service)" onClose={onClose}>
      <div className="col">
        <p className="muted sm" style={{ margin: 0 }}>Known contact/domain → account + contract matched automatically. Put <span className="mono">[INC-000123]</span> in the subject to thread onto an existing ticket. Unknown senders land in Triage.</p>
        <label>From<input value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} /></label>
        <label>Subject<input value={f.subject} onChange={(e) => setF({ ...f, subject: e.target.value })} /></label>
        <label>Body<textarea value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} /></label>
        <button className="btn pri" onClick={async () => onDone(await api('/inbound/email', { body: f }))}>Deliver</button>
      </div>
    </Modal>
  );
}
