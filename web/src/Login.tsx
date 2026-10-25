import { useState } from 'react';
import { api } from './api';

export function Login({ onLogin }: { onLogin: (u: any) => void }) {
  const [username, setUsername] = useState(''); const [password, setPassword] = useState('');
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setErr('');
    try { await api('/auth/login', { body: { username, password } }); onLogin(await api('/auth/me')); }
    catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };
  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 16 }}>
      <form className="card col" style={{ width: 'min(380px,100%)', gap: 14, padding: 24 }} onSubmit={submit}>
        <div><h2 style={{ margin: 0 }}>Unified Ops</h2><div className="muted sm">CRM · ITSM · ITOM — sign in to continue</div></div>
        <label>Username<input autoFocus autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} /></label>
        <label>Password<input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} /></label>
        {err && <div role="alert" style={{ color: 'var(--crit)' }}>{err}</div>}
        <button className="btn pri" disabled={busy || !username || !password}>{busy ? 'Signing in…' : 'Sign in'}</button>
      </form>
    </div>
  );
}
