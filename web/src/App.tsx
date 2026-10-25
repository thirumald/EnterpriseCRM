import { useCallback, useEffect, useState } from 'react';
import { api } from './api';
import { Noc } from './Noc';
import { Agent } from './Agent';
import { Engineer } from './Engineer';
import { Crm } from './Crm';
import { Admin } from './Admin';
import { Portal } from './Portal';
import { Login } from './Login';

type View = 'noc' | 'agent' | 'engineer' | 'crm' | 'portal' | 'admin';
const NAV: [View, string][] = [['noc', '🖥 NOC dashboard'], ['agent', '🎧 Help Desk'], ['engineer', '🛠 Infrastructure'], ['crm', '🤝 CRM Accounts'], ['portal', '🌐 Customer portal'], ['admin', '⚙ Administration']];
const ACCESS: Record<string, View[]> = {
  admin: ['noc', 'agent', 'engineer', 'crm', 'portal', 'admin'], agent: ['noc', 'agent', 'crm'], engineer: ['noc', 'agent', 'engineer'],
  account_manager: ['noc', 'crm', 'agent'], noc: ['noc', 'agent'], customer: ['portal'],
};
const LABEL: Record<string, string> = { admin: 'Administrator', agent: 'Help Desk Agent', engineer: 'Infrastructure Engineer', account_manager: 'Account Manager', noc: 'NOC Operator', customer: 'Customer' };

export default function App() {
  const [me, setMe] = useState<any | null | undefined>(undefined);
  useEffect(() => { api('/auth/me').then(setMe).catch(() => setMe(null)); }, []);
  useEffect(() => { const f = () => setMe(null); window.addEventListener('auth-expired', f); return () => window.removeEventListener('auth-expired', f); }, []);
  if (me === undefined) return <div className="muted" style={{ padding: 24 }}>Loading…</div>;
  if (me === null) return <Login onLogin={setMe} />;
  return <Shell me={me} onLogout={async () => { await api('/auth/logout', { method: 'POST', body: {} }).catch(() => {}); setMe(null); }} />;
}

function Shell({ me, onLogout }: { me: any; onLogout: () => void }) {
  const allowed = ACCESS[me.role] ?? [];
  const saved = localStorage.getItem('view') as View;
  const [view, setView] = useState<View>(allowed.includes(saved) ? saved : allowed[0]);
  const [wall, setWall] = useState(false);
  const [theme, setTheme] = useState(localStorage.getItem('theme') || 'dark');
  const [ticket, setTicket] = useState<number | null>(null);
  const [ci, setCi] = useState<number | null>(null);
  const [account, setAccount] = useState<number | null>(null);
  useEffect(() => { document.documentElement.dataset.theme = theme; localStorage.setItem('theme', theme); }, [theme]);
  useEffect(() => { localStorage.setItem('view', view); }, [view]);
  const go = useCallback((v: View) => { if (allowed.includes(v)) setView(v); }, [allowed]);
  const openTicket = (id: number) => { setTicket(id); go('agent'); };
  const openCi = (id: number) => { setCi(id); go('engineer'); };
  const openAccount = (id: number) => { setAccount(id); go('crm'); };
  const canSim = me.role === 'admin' && me.sim;
  return (
    <div className={`app ${wall ? 'wall' : ''}`}>
      <nav className="side">
        <h1>Unified Ops<br /><small style={{ margin: 0 }}>CRM · ITSM · ITOM</small></h1>
        {NAV.filter(([v]) => allowed.includes(v)).map(([v, label]) => <button key={v} className={`nav ${view === v ? 'on' : ''}`} onClick={() => go(v)}>{label}</button>)}
        <small>Signed in</small>
        <div className="sm" style={{ padding: '0 8px' }}><b>{me.display_name ?? me.username}</b><div className="muted">{LABEL[me.role]}</div></div>
        <div style={{ flex: 1 }} />
        {me.role !== 'customer' && <button className="nav" onClick={() => setWall(!wall)}>{wall ? '⤡ Exit wall mode' : '⤢ NOC wall mode'}</button>}
        <button className="nav" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>{theme === 'dark' ? '☀ Light theme' : '🌙 Dark theme'}</button>
        <button className="nav" onClick={onLogout}>⎋ Sign out</button>
      </nav>
      <main className="main">
        {wall && <button className="btn" style={{ position: 'fixed', right: 12, top: 12, zIndex: 5 }} onClick={() => setWall(false)}>Exit wall mode</button>}
        {view === 'noc' && <Noc wall={wall} openTicket={openTicket} openCi={openCi} />}
        {view === 'agent' && <Agent me={me.username} initial={ticket} openAccount={openAccount} openCi={openCi} />}
        {view === 'engineer' && <Engineer openTicket={openTicket} initialCi={ci} key={ci ?? 0} sim={canSim} />}
        {view === 'crm' && <Crm initial={account} openTicket={openTicket} openCi={openCi} key={account ?? 0} />}
        {view === 'portal' && <Portal fixedAccount={me.role === 'customer' ? me.account_id : null} />}
        {view === 'admin' && <Admin />}
      </main>
    </div>
  );
}
