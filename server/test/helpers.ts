process.env.DATABASE_URL ??= 'postgres://postgres@localhost:5433/enterprisecrm_test';
process.env.DISABLE_SCHEDULERS = '1';
const db = await import('../src/db.ts');
const { seed } = await import('../src/seed.ts');
const { buildApp } = await import('../src/app.ts');
export const { q, one, pool } = db;
export async function fresh() { await db.resetDb(); return seed(); }
export { buildApp };
export const minutes = (n: number, from = new Date()) => new Date(from.getTime() + n * 60000);
