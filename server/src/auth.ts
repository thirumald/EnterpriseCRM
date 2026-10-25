import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { q, one } from './db.ts';

export type Role = 'admin' | 'agent' | 'engineer' | 'account_manager' | 'noc' | 'customer';
export interface AuthUser { id: number; username: string; display_name: string; role: Role; account_id: number | null }

const PROD = process.env.NODE_ENV === 'production';
const SECRET = process.env.SESSION_SECRET ?? (PROD ? '' : 'dev-only-secret-change-me');
if (PROD && SECRET.length < 32) throw new Error('SESSION_SECRET (>=32 chars) is required in production');
const TTL_MS = 12 * 3600_000;
export const SIM_ENABLED = process.env.ENABLE_SIM ? process.env.ENABLE_SIM === 'true' : !PROD;

// ---- passwords (scrypt) ---------------------------------------------------------------------------
export function hashPassword(pw: string) {
  const salt = crypto.randomBytes(16);
  return `scrypt$${salt.toString('hex')}$${crypto.scryptSync(pw, salt, 64).toString('hex')}`;
}
export function verifyPassword(pw: string, stored: string) {
  const [alg, salt, hash] = stored.split('$');
  if (alg !== 'scrypt' || !salt || !hash) return false;
  const h = crypto.scryptSync(pw, Buffer.from(salt, 'hex'), 64);
  const want = Buffer.from(hash, 'hex');
  return h.length === want.length && crypto.timingSafeEqual(h, want);
}

// ---- signed session token (HMAC-SHA256) ---------------------------------------------------------------
export function signToken(uid: number, now = Date.now()) {
  const body = Buffer.from(JSON.stringify({ uid, exp: now + TTL_MS })).toString('base64url');
  return `${body}.${crypto.createHmac('sha256', SECRET).update(body).digest('base64url')}`;
}
export function readToken(tok: string | undefined, now = Date.now()): number | undefined {
  if (!tok) return;
  const [body, sig] = tok.split('.');
  if (!body || !sig) return;
  const want = crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
  const a = Buffer.from(sig), b = Buffer.from(want);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return;
  try { const p = JSON.parse(Buffer.from(body, 'base64url').toString()); return p.exp > now ? p.uid : undefined; } catch { /* bad token */ }
}
function cookie(req: Request, name: string) {
  for (const part of (req.headers.cookie ?? '').split(';')) { const [k, ...v] = part.trim().split('='); if (k === name) return decodeURIComponent(v.join('=')); }
}
export function setSession(res: Response, uid: number) {
  res.cookie('session', signToken(uid), { httpOnly: true, sameSite: 'lax', secure: PROD, maxAge: TTL_MS, path: '/' });
}

// ---- login throttling ---------------------------------------------------------------------------------
const fails = new Map<string, { n: number; until: number }>();
export function throttled(key: string, now = Date.now()) { const f = fails.get(key); return !!f && f.n >= 5 && f.until > now; }
export function noteFail(key: string, now = Date.now()) { const f = fails.get(key); fails.set(key, { n: (f && f.until > now ? f.n : 0) + 1, until: now + 15 * 60_000 }); }
export function clearFails(key: string) { fails.delete(key); }

// ---- machine credentials (collectors, email gateway, public API) -------------------------------------
export function apiKeyOk(req: Request) {
  const want = process.env.API_KEY;
  const got = req.header('x-api-key') ?? '';
  if (!want) return false;
  const a = Buffer.from(got), b = Buffer.from(want);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// ---- authorisation matrix --------------------------------------------------------------------------------
const STAFF: Role[] = ['admin', 'agent', 'engineer', 'account_manager', 'noc'];
type Rule = { re: RegExp; read: Role[]; write: Role[]; machine?: boolean };
const R = (re: RegExp, read: Role[], write: Role[], machine = false): Rule => ({ re, read, write, machine });
const RULES: Rule[] = [
  R(/^\/(meta|search|me)$/, STAFF, STAFF),
  R(/^\/(dashboard|sites|topology)(\/|$)/, STAFF, ['admin']),
  R(/^\/alerts/, STAFF, ['admin', 'engineer', 'noc', 'agent']),
  R(/^\/(tickets|kb)/, STAFF, ['admin', 'agent', 'engineer']),
  R(/^\/admin\/sla-tick$/, ['admin'], ['admin']),
  R(/^\/(accounts|contracts|opportunities)/, ['admin', 'agent', 'engineer', 'account_manager', 'noc'], ['admin', 'account_manager']),
  R(/^\/reports\/(sla|pipeline)/, ['admin', 'account_manager', 'noc', 'agent'], []),
  R(/^\/(reports|cis|ipam|discovery|maintenance|checks|relationships|collectors|warranties|syslog)/, STAFF, ['admin', 'engineer']),
  R(/^\/sla\//, STAFF, ['admin']),
  R(/^\/(rules|rules-executions|notifications|audit|users)/, ['admin'], ['admin']),
  R(/^\/sim\//, ['admin'], ['admin']),
  R(/^\/(ingest\/.*|inbound\/email|v1\/tickets)$/, [], [], true),
];
/** Customers see only their own account's data (enforced in `scopeCustomer`). */
const CUSTOMER_OK = [
  ['GET', /^\/(me|meta)$/], ['GET', /^\/accounts\/(\d+)$/], ['GET', /^\/tickets$/], ['GET', /^\/tickets\/(\d+)$/], ['POST', /^\/tickets$/],
  ['POST', /^\/tickets\/(\d+)\/(reply|csat)$/],
] as const;

export async function loadUser(req: Request): Promise<AuthUser | undefined> {
  const uid = readToken(cookie(req, 'session'));
  if (!uid) return;
  return one<AuthUser>('SELECT id, username, display_name, role, account_id FROM users WHERE id=$1 AND active', [uid]);
}

/** Applies authentication + authorisation to every /api route except the public ones. */
export function guard(opts: { simEnabled: boolean }) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const path = req.path, write = req.method !== 'GET' && req.method !== 'HEAD';
    if (path === '/health' || path === '/auth/login' || path === '/auth/logout') return next();
    const rule = RULES.find((r) => r.re.test(path));
    if (rule?.machine) {
      if (apiKeyOk(req)) { (req as any).actor = 'api'; return next(); }
      const u = await loadUser(req);
      if (u && u.role === 'admin') { (req as any).user = u; (req as any).actor = u.username; return next(); }
      return void res.status(401).json({ error: 'API key required' });
    }
    const user = await loadUser(req);
    if (!user) return void res.status(401).json({ error: 'authentication required' });
    (req as any).user = user; (req as any).actor = user.username;
    if (path.startsWith('/sim/') && !opts.simEnabled) return void res.status(404).json({ error: 'simulator disabled' });
    if (user.role === 'customer') return scopeCustomer(user, req, res, next);
    if (path === '/auth/me') return next();
    if (!rule) return void res.status(403).json({ error: 'forbidden' });
    const allowed = write ? rule.write : rule.read;
    if (!allowed.includes(user.role)) return void res.status(403).json({ error: `role ${user.role} may not ${write ? 'modify' : 'view'} this` });
    next();
  };
}

async function scopeCustomer(user: AuthUser, req: Request, res: Response, next: NextFunction) {
  if (req.path === '/auth/me') return next();
  const ok = CUSTOMER_OK.find(([m, re]) => m === req.method && re.test(req.path));
  if (!ok || !user.account_id) return void res.status(403).json({ error: 'forbidden' });
  const m = ok[1].exec(req.path);
  if (/^\/accounts\//.test(req.path) && Number(m![1]) !== user.account_id) return void res.status(403).json({ error: 'forbidden' });
  if (/^\/tickets\/\d+/.test(req.path)) {
    const t = await one('SELECT account_id FROM tickets WHERE id=$1', [Number(m![1])]);
    if (!t || t.account_id !== user.account_id) return void res.status(403).json({ error: 'forbidden' });
    if (/\/reply$/.test(req.path)) req.body = { kind: 'customer', body: String(req.body?.body ?? '') };
  }
  if (req.path === '/tickets' && req.method === 'POST') {
    const b = req.body ?? {};
    req.body = { subject: b.subject, description: b.description, channel: 'portal', priority: 'P3', account_id: user.account_id,
      ci_id: b.ci_id ? (await one('SELECT id FROM config_items WHERE id=$1 AND owner_account_id=$2', [b.ci_id, user.account_id]))?.id ?? null : null };
  }
  next();
}

export async function createUser(u: { username: string; password: string; role: Role; display_name?: string; account_id?: number | null }) {
  if (u.password.length < 8) throw new Error('password must be at least 8 characters');
  return one(`INSERT INTO users(username,display_name,role,password_hash,account_id) VALUES ($1,$2,$3,$4,$5)
    ON CONFLICT (username) DO UPDATE SET password_hash=EXCLUDED.password_hash, role=EXCLUDED.role, active=true RETURNING id, username, role`,
    [u.username.toLowerCase(), u.display_name ?? u.username, u.role, hashPassword(u.password), u.account_id ?? null]);
}

/** Bootstraps the first admin (and, for demo deployments, staff + customer logins). Never ships fixed passwords in production. */
export async function bootstrapUsers(opts: { demo: boolean }) {
  const have = await one('SELECT count(*)::int n FROM users');
  if (have.n > 0) return;
  const pw = process.env.ADMIN_PASSWORD ?? crypto.randomBytes(9).toString('base64url');
  await createUser({ username: process.env.ADMIN_USERNAME ?? 'admin', password: pw, role: 'admin', display_name: 'Administrator' });
  if (!process.env.ADMIN_PASSWORD) console.log(`[auth] generated admin password (shown once): ${pw}`);
  if (opts.demo) {
    const dpw = process.env.DEMO_PASSWORD ?? (PROD ? crypto.randomBytes(9).toString('base64url') : 'demo1234');
    for (const [username, role, name] of [['alice.agent', 'agent', 'Alice Agent'], ['nina.network', 'engineer', 'Nina Network'], ['mia.manager', 'account_manager', 'Mia Manager'], ['noc.operator', 'noc', 'NOC Operator']] as const)
      await createUser({ username, password: dpw, role, display_name: name });
    const acme = await one(`SELECT id FROM accounts WHERE name LIKE 'Acme Manufacturing'`);
    if (acme) await createUser({ username: 'wendy@acme.example', password: dpw, role: 'customer', display_name: 'Wendy Wu (Acme)', account_id: acme.id });
    if (!process.env.DEMO_PASSWORD) console.log(`[auth] demo users created (alice.agent, nina.network, mia.manager, noc.operator, wendy@acme.example); password: ${dpw}`);
  }
}
void q;
