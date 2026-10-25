import { useEffect, useState } from 'react';
import { setUser, useApi } from './api';
import { Noc } from './Noc';
import { Agent } from './Agent';
import { Engineer } from './Engineer';
import { Crm } from './Crm';
import { Admin } from './Admin';
import { Portal } from './Portal';

type View = 'noc' | 'agent' | 'engineer' | 'crm' | 'portal' | 'admin';
const NAV: [View, string, string][] = [['noc', '🖥 NOC dashboard', 'NOC Operator'], ['agent', '🎧 Help Desk', 'Help Desk Agent'], ['engineer', '🛠 Infrastructure', 'Infrastructure Engineer'], ['crm', '🤝 CRM Accounts', 'Account Manager'], ['portal', '🌐 Customer portal', 'Customer'], ['admin', '⚙ Administration', 'Admin']];
const USERS: Record<View, string> = { noc: 'noc.operator', agent: 'alice.agent', engineer: 'nina.network', crm: 'mia.manager', portal: 'customer', admin: 'admin' };

export default function App() {
  const [view, setView] = useState<View>((localStorage.getItem('view') as View) || 'noc');
  const [wall, setWall] = useState(false);
  const [theme, setTheme] = useState(localStorage.getItem('theme') || 'dark');
  const [ticket, setTicket] = useState<number | null>(null);
  const [ci, setCi] = useState<number | null>(null);
  const [account, setAccount] = useState<number | null>(null);
  const health = useApi<any>('/health', { every: 10000 });
  useEffect(() => { document.documentElement.dataset.theme = theme; localStorage.setItem('theme', theme); }, [theme]);
  useEffect(() => { setUser(USERS[view]); localStorage.setItem('view', view); }, [view]);
  const go = (v: View) => { setView(v); };
  const openTicket = (id: number) => { setTicket(id); setView('agent'); };
  const openCi = (id: number) => { setCi(id); setView('engineer'); };
  const openAccount = (id: number) => { setAccount(id); setView('crm'); };
  return (
    <div className={`app ${wall ? 'wall' : ''}`}>
      <nav className="side">
        <h1>Unified Ops<br /><small style={{ margin: 0 }}>CRM · ITSM · ITOM</small></h1>
        {NAV.map(([v, label, role]) => <button key={v} className={`nav ${view === v ? 'on' : ''}`} onClick={() => go(v)} title={role}>{label}</button>)}
        <small>Workspace</small>
        <div className="sm muted" style={{ padding: '0 8px' }}>{NAV.find((n) => n[0] === view)![2]} · {USERS[view]}</div>
        <div style={{ flex: 1 }} />
        <button className="nav" onClick={() => setWall(!wall)}>{wall ? '⤡ Exit wall mode' : '⤢ NOC wall mode'}</button>
        <button className="nav" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>{theme === 'dark' ? '☀ Light theme' : '🌙 Dark theme'}</button>
        <div className="sm muted" style={{ padding: '4px 8px' }}>API: {health.error ? <span style={{ color: 'var(--crit)' }}>offline</span> : <span style={{ color: 'var(--ok)' }}>online</span>}</div>
      </nav>
      <main className="main">
        {wall && <button className="btn" style={{ position: 'fixed', right: 12, top: 12, zIndex: 5 }} onClick={() => setWall(false)}>Exit wall mode</button>}
        {view === 'noc' && <Noc wall={wall} openTicket={openTicket} openCi={openCi} />}
        {view === 'agent' && <Agent me={USERS.agent} initial={ticket} openAccount={openAccount} openCi={openCi} />}
        {view === 'engineer' && <Engineer openTicket={openTicket} initialCi={ci} key={ci ?? 0} />}
        {view === 'crm' && <Crm initial={account} openTicket={openTicket} openCi={openCi} key={account ?? 0} />}
        {view === 'portal' && <Portal />}
        {view === 'admin' && <Admin />}
      </main>
    </div>
  );
}
