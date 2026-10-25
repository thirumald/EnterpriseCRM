import dgram from 'node:dgram';
import { migrate, one } from './db.ts';
import { buildApp } from './app.ts';
import { seed } from './seed.ts';
import { seedRules } from './alerts.ts';
import { startCollectors, startSchedulers } from './runtime.ts';
import { handleSyslog } from './monitoring.ts';

const port = Number(process.env.PORT ?? 4000);
const { timescale } = await migrate();
await seedRules();
if (!(await one('SELECT 1 x FROM accounts LIMIT 1'))) { await seed(); console.log('[seed] demo data loaded'); }
await startCollectors();
if (process.env.DISABLE_SCHEDULERS !== '1') startSchedulers();

const syslogPort = Number(process.env.SYSLOG_PORT ?? 5514);
if (syslogPort) {
  const sock = dgram.createSocket('udp4');
  sock.on('message', (m, rinfo) => handleSyslog(m.toString(), rinfo.address).catch((e) => console.error('[syslog]', e.message)));
  sock.on('error', (e) => console.error('[syslog]', e.message));
  sock.bind(syslogPort, () => console.log(`[syslog] UDP listener on ${syslogPort}`));
}
buildApp().listen(port, () => console.log(`[api] http://localhost:${port}  (timescaledb=${timescale})`));
