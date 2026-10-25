import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { fresh, pool, startApi, q } from './helpers.ts';
import * as auth from '../src/auth.ts';

let ids: any, api: Awaited<ReturnType<typeof startApi>>;
const cookies: Record<string, string> = {};
before(async () => {
  ids = await fresh();
  const mk = (username: string, role: any, account_id?: number) => auth.createUser({ username, password: 'password-' + username, role, account_id });
  await mk('adm', 'admin'); await mk('agt', 'agent'); await mk('eng', 'engineer'); await mk('acm', 'account_manager'); await mk('noc', 'noc');
  await mk('cust-acme', 'customer', ids.acme); await mk('cust-globex', 'customer', ids.globex);
  api = await startApi();
  for (const u of ['adm', 'agt', 'eng', 'acm', 'noc', 'cust-acme', 'cust-globex']) cookies[u] = (await api.login(u, 'password-' + u)).cookie!;
});
after(async () => { api.close(); await pool.end(); });

test('password hashing and signed tokens', () => {
  const h = auth.hashPassword('s3cret-pass');
  assert.ok(auth.verifyPassword('s3cret-pass', h)); assert.ok(!auth.verifyPassword('wrong', h)); assert.notEqual(h, auth.hashPassword('s3cret-pass'));
  const tok = auth.signToken(7, 1000);
  assert.equal(auth.readToken(tok, 1001), 7);
  assert.equal(auth.readToken(tok, 1000 + 13 * 3600_000), undefined, 'expired');
  const [b, s] = tok.split('.');
  assert.equal(auth.readToken(`${Buffer.from(JSON.stringify({ uid: 1, exp: 9e15 })).toString('base64url')}.${s}`), undefined, 'tampered payload');
  assert.equal(auth.readToken(`${b}.AAAA`), undefined, 'bad signature');
});

test('API requires authentication; health is public; bad passwords are rejected and throttled', async () => {
  assert.equal((await api.call('/health')).status, 200);
  for (const p of ['/tickets', '/accounts', '/dashboard/noc', '/events', '/cis', '/users']) assert.equal((await api.call(p)).status, 401, p);
  assert.equal((await api.login('adm', 'nope')).status, 401);
  assert.equal((await api.login('ghost', 'whatever1')).status, 401);
  assert.equal((await api.call('/tickets', { cookie: 'session=garbage' })).status, 401);
  for (let i = 0; i < 5; i++) await api.login('noc', 'bad-' + i);
  assert.equal((await api.login('noc', 'password-noc')).status, 429, 'throttled after repeated failures');
  auth.clearFails('127.0.0.1|noc'); auth.clearFails('::ffff:127.0.0.1|noc');
});

test('role matrix', async () => {
  const c = (u: string, p: string, o: any = {}) => api.call(p, { cookie: cookies[u], ...o });
  assert.equal((await c('agt', '/tickets')).status, 200);
  assert.equal((await c('agt', '/rules')).status, 403);
  assert.equal((await c('agt', '/rules/R1', { method: 'PATCH', body: { enabled: false } })).status, 403);
  assert.equal((await c('adm', '/rules')).status, 200);
  assert.equal((await c('eng', '/accounts', { body: { name: 'X' } })).status, 403, 'engineer cannot create accounts');
  assert.equal((await c('acm', '/accounts', { body: { name: 'Auth Test Co' } })).status, 200);
  assert.equal((await c('acm', '/cis', { body: { ci_class: 'Server', name: 'x' } })).status, 403, 'account manager cannot edit CMDB');
  assert.equal((await c('eng', '/maintenance', { body: { name: 'm', ci_id: ids.acmeErp, start_at: new Date().toISOString(), end_at: new Date(Date.now() + 60000).toISOString() } })).status, 200);
  assert.equal((await c('noc', '/dashboard/noc')).status, 200);
  assert.equal((await c('noc', '/tickets', { body: { subject: 'nope' } })).status, 403, 'NOC operator is read-only on tickets');
  assert.equal((await c('agt', '/users')).status, 403);
  assert.equal((await c('adm', '/users')).status, 200);
  assert.equal((await c('agt', '/sim/fault', { body: { ci_id: 1, metric: 'cpu', value: 99 } })).status, 403);
  assert.equal((await c('agt', '/auth/me')).body.role, 'agent');
});

test('machine endpoints need the API key (or an admin session)', async () => {
  const batch = { collector_id: 1, seq: 1e9, sent_at: new Date().toISOString(), points: [], alerts: [], raw_samples: 0 };
  assert.equal((await api.call('/ingest/batch', { body: batch })).status, 401);
  assert.equal((await api.call('/ingest/batch', { body: batch, key: 'wrong' })).status, 401);
  assert.equal((await api.call('/ingest/batch', { body: batch, key: 'test-api-key' })).status, 200);
  assert.equal((await api.call('/ingest/batch', { body: batch, cookie: cookies.agt })).status, 401, 'agents cannot post telemetry');
  assert.equal((await api.call('/inbound/email', { body: { from: 'a@b.c', subject: 's', body: 'b' } })).status, 401);
  assert.equal((await api.call('/v1/tickets', { body: { subject: 'x' }, key: 'test-api-key' })).status, 201);
});

test('customer isolation: own account/tickets only, no internal data, forced scoping', async () => {
  const c = (u: string, p: string, o: any = {}) => api.call(p, { cookie: cookies[u], ...o });
  const mine = await c('cust-acme', `/accounts/${ids.acme}`);
  assert.equal(mine.status, 200);
  assert.deepEqual([mine.body.contracts, mine.body.opportunities, mine.body.activities, mine.body.alerts], [[], [], [], []]);
  assert.ok(mine.body.assets.length > 0 && !('criticality' in mine.body.assets[0]));
  assert.equal((await c('cust-acme', `/accounts/${ids.globex}`)).status, 403);
  for (const p of ['/cis', '/accounts', '/contracts', '/dashboard/noc', '/alerts', '/users', '/rules', '/kb']) assert.equal((await c('cust-acme', p)).status, 403, p);
  // create ticket: account is forced to the customer's own, even if they try to spoof another
  const t = await c('cust-acme', '/tickets', { body: { subject: 'Spoof', account_id: ids.globex, priority: 'P1', ci_id: ids.globexApp } });
  assert.equal(t.status, 200); assert.equal(t.body.priority, 'P3'); assert.ok(!('assignee' in t.body));
  const row = (await q('SELECT account_id, ci_id, channel FROM tickets WHERE id=$1', [t.body.id]))[0];
  assert.deepEqual([row.account_id, row.ci_id, row.channel], [ids.acme, null, 'portal']);
  // other customer cannot read or reply
  assert.equal((await c('cust-globex', `/tickets/${t.body.id}`)).status, 403);
  assert.equal((await c('cust-globex', `/tickets/${t.body.id}/reply`, { body: { body: 'hi' } })).status, 403);
  // list is scoped regardless of query string
  const list = await c('cust-globex', `/tickets?account_id=${ids.acme}`);
  assert.ok(list.body.every((x: any) => x.account_id === ids.globex));
  // internal events hidden; reply forced to customer kind
  await api.call(`/tickets/${t.body.id}/reply`, { cookie: cookies.agt, body: { kind: 'note', body: 'INTERNAL: customer is difficult' } });
  await api.call(`/tickets/${t.body.id}/reply`, { cookie: cookies.agt, body: { kind: 'agent', body: 'Looking into it' } });
  const r = await c('cust-acme', `/tickets/${t.body.id}/reply`, { body: { kind: 'agent', body: 'pretend I am an agent' } });
  assert.equal(r.status, 200);
  const d = await c('cust-acme', `/tickets/${t.body.id}`);
  const bodies = d.body.events.map((e: any) => e.body).join('|');
  assert.ok(!bodies.includes('INTERNAL') && bodies.includes('Looking into it'));
  assert.ok(!('assignee' in d.body) && !('alerts' in d.body) && d.body.timers.length === 0);
  const kinds = (await q(`SELECT type FROM ticket_events WHERE ticket_id=$1 AND body='pretend I am an agent'`, [t.body.id]))[0].type;
  assert.equal(kinds, 'customer_reply');
  assert.equal((await c('cust-acme', `/tickets/${t.body.id}/csat`, { body: { score: 9 } })).status, 400);
});

test('simulator routes are disabled when the guard says so', async () => {
  const app = express(); app.use(express.json());
  app.use('/api', auth.guard({ simEnabled: false }), (_req, res) => res.json({ reached: true }));
  const srv: any = await new Promise((r) => { const s = app.listen(0, () => r(s)); });
  const res = await fetch(`http://127.0.0.1:${srv.address().port}/api/sim/fault`, { method: 'POST', headers: { cookie: cookies.adm, 'content-type': 'application/json' }, body: '{}' });
  srv.close();
  assert.equal(res.status, 404);
});

test('user management: deactivated users lose access immediately; short passwords rejected', async () => {
  const u = await api.call('/users', { cookie: cookies.adm, body: { username: 'temp.agent', password: 'longenough1', role: 'agent' } });
  assert.equal(u.status, 200);
  assert.equal((await api.call('/users', { cookie: cookies.adm, body: { username: 'bad', password: 'short', role: 'agent' } })).status, 500);
  const { cookie } = await api.login('temp.agent', 'longenough1');
  assert.equal((await api.call('/tickets', { cookie })).status, 200);
  await api.call(`/users/${u.body.id}`, { method: 'PATCH', cookie: cookies.adm, body: { active: false } });
  assert.equal((await api.call('/tickets', { cookie })).status, 401);
  assert.equal((await api.login('temp.agent', 'longenough1')).status, 401);
});
