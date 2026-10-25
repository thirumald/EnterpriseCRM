process.env.DATABASE_URL ??= 'postgres://postgres@localhost:5433/enterprisecrm_test';
process.env.DISABLE_SCHEDULERS = '1';
process.env.API_KEY = 'test-api-key';
const db = await import('../src/db.ts');
const { seed } = await import('../src/seed.ts');
const { buildApp } = await import('../src/app.ts');
export const { q, one, pool } = db;
export async function fresh() { await db.resetDb(); return seed(); }
export { buildApp };
export const minutes = (n: number, from = new Date()) => new Date(from.getTime() + n * 60000);

export async function startApi() {
  const server: import('node:http').Server = await new Promise((r) => { const s = buildApp().listen(0, () => r(s)); });
  const base = `http://127.0.0.1:${(server.address() as any).port}/api`;
  const call = async (p: string, o: { method?: string; body?: any; cookie?: string; key?: string; headers?: Record<string, string> } = {}) => {
    const res = await fetch(base + p, { method: o.method ?? (o.body ? 'POST' : 'GET'), body: o.body ? JSON.stringify(o.body) : undefined,
      headers: { 'content-type': 'application/json', ...(o.cookie ? { cookie: o.cookie } : {}), ...(o.key ? { 'x-api-key': o.key } : {}), ...(o.headers ?? {}) } });
    return { status: res.status, body: await res.json().catch(() => ({})), setCookie: res.headers.get('set-cookie') };
  };
  const login = async (username: string, password: string) => {
    const r = await call('/auth/login', { body: { username, password } });
    return { ...r, cookie: r.setCookie?.split(';')[0] };
  };
  return { call, login, close: () => server.close() };
}
