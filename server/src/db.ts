import pg from 'pg';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// Return int8/numeric as JS numbers (counts, money) - fine for this domain.
pg.types.setTypeParser(20, (v) => Number(v));
pg.types.setTypeParser(1700, (v) => Number(v));

export const DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://postgres@localhost:5432/enterprisecrm';
export const pool = new pg.Pool({ connectionString: DATABASE_URL, max: 10, ssl: process.env.PGSSL === 'true' ? { rejectUnauthorized: false } : undefined });

export async function q<T = any>(text: string, params: any[] = []): Promise<T[]> {
  return (await pool.query(text, params)).rows as T[];
}
export async function one<T = any>(text: string, params: any[] = []): Promise<T | undefined> {
  return (await q<T>(text, params))[0];
}

const here = dirname(fileURLToPath(import.meta.url));

/** Apply schema.sql and promote `metrics` to a Timescale hypertable when the extension is available. */
export async function migrate(): Promise<{ timescale: boolean }> {
  await pool.query(readFileSync(join(here, '../../db/schema.sql'), 'utf8'));
  let timescale = false;
  try {
    await pool.query('CREATE EXTENSION IF NOT EXISTS timescaledb');
    await pool.query("SELECT create_hypertable('metrics','time',if_not_exists=>TRUE,migrate_data=>TRUE)");
    await pool.query("SELECT create_hypertable('iot_telemetry','time',if_not_exists=>TRUE,migrate_data=>TRUE)");
    timescale = true;
  } catch { /* plain PostgreSQL: tables work unchanged, retention is handled by pruneMetrics() */ }
  return { timescale };
}

export async function resetDb() {
  await pool.query(`DO $$ DECLARE r record; BEGIN
    FOR r IN SELECT tablename FROM pg_tables WHERE schemaname='public' LOOP
      EXECUTE 'DROP TABLE IF EXISTS public.' || quote_ident(r.tablename) || ' CASCADE'; END LOOP; END $$;`);
  return migrate();
}

export async function audit(actor: string, action: string, entity: string, entityId: string | number, detail: any = {}) {
  await q('INSERT INTO audit_log(actor,action,entity,entity_id,detail) VALUES ($1,$2,$3,$4,$5)', [actor, action, entity, String(entityId), detail]);
}
