import { q, one } from './db.ts';
import { publish } from './events.ts';
import * as alerts from './alerts.ts';
import * as hd from './helpdesk.ts';
import type { Batch } from './collector.ts';
import { dirFor, severityFor } from './templates.ts';

/** Main-DC ingest: idempotent by (collector, seq). Writes aggregates, updates collector state, processes alert candidates. */
export async function ingestBatch(b: Batch) {
  const col = await one('SELECT * FROM collectors WHERE id=$1', [b.collector_id]);
  if (!col) throw new Error('unknown collector');
  if (b.seq <= col.last_seq) return { duplicate: true };
  for (const p of b.points)
    await q(`INSERT INTO metrics(time,ci_id,metric,avg,min,max,p95,samples) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT DO NOTHING`,
      [p.time, p.ci_id, p.metric, p.avg, p.min, p.max, p.p95, p.samples]);
  await q(`UPDATE collectors SET last_seq=$2, last_heartbeat=now(), status='ONLINE', raw_samples_total=raw_samples_total+$3,
    forwarded_points_total=forwarded_points_total+$4 WHERE id=$1`, [b.collector_id, b.seq, b.raw_samples, b.points.length]);
  if (col.status === 'STALE') await collectorRecovered(col);
  const at = new Date(b.sent_at);
  for (const a of b.alerts) {
    if (a.clear) await alerts.closeAlert(a.ci_id, a.metric, at);
    else await alerts.raiseAlert({ ci_id: a.ci_id, metric: a.metric, severity: a.severity, message: a.message, value: a.value }, at);
  }
  publish('telemetry.batch', { collector_id: b.collector_id, points: b.points.length, raw: b.raw_samples });
  return { duplicate: false, points: b.points.length };
}

export async function heartbeat(collectorId: number, queueDepth: number, wanUp: boolean) {
  await q('UPDATE collectors SET queue_depth=$2, wan_up=$3 WHERE id=$1', [collectorId, queueDepth, wanUp]);
  if (wanUp) {
    const col = await one(`UPDATE collectors SET last_heartbeat=now() WHERE id=$1 RETURNING *`, [collectorId]);
    if (col?.status === 'STALE') await collectorRecovered(col);
  }
}

/** R20: collector offline -> one incident, site CIs UNKNOWN (never DOWN). */
export async function collectorWatchdog(now = new Date(), heartbeatSec = 15) {
  const r = await one(`SELECT * FROM workflow_rules WHERE code='R20' AND enabled`);
  if (!r) return;
  const cutoff = new Date(now.getTime() - r.params.missed_beats * heartbeatSec * 1000);
  const stale = await q(`SELECT c.*, s.name site_name FROM collectors c JOIN sites s ON s.id=c.site_id WHERE c.status='ONLINE' AND c.last_heartbeat < $1`, [cutoff]);
  for (const c of stale) {
    await q(`UPDATE collectors SET status='STALE' WHERE id=$1`, [c.id]);
    await q(`UPDATE config_items SET state='UNKNOWN' WHERE site_id=$1 AND state='UP'`, [c.site_id]);
    const t = await hd.createTicket({ subject: `Site collector unreachable: ${c.site_name}`, description: `No heartbeat from ${c.name} (${r.params.missed_beats} missed beats). Devices marked UNKNOWN, not DOWN. [collector:${c.id}]`, priority: 'P2', channel: 'alert', queue: 'Network Ops', type: 'Incident' }, now);
    await q('INSERT INTO workflow_executions(rule_code,trigger,subject,outcome) VALUES ($1,$2,$3,$4)', ['R20', 'heartbeat.missed', c.site_name, `ticket ${t.number}; site CIs -> UNKNOWN`]);
    publish('collector.stale', { collector_id: c.id, site: c.site_name });
  }
}
async function collectorRecovered(col: any) {
  await q(`UPDATE collectors SET status='ONLINE' WHERE id=$1`, [col.id]);
  await q(`UPDATE config_items SET state='UP' WHERE site_id=$1 AND state='UNKNOWN' AND id NOT IN (SELECT ci_id FROM alerts WHERE state<>'closed')`, [col.site_id]);
  const t = await one(`SELECT id FROM tickets WHERE description LIKE $1 AND status NOT IN ('Resolved','Closed')`, [`%[collector:${col.id}]%`]);
  if (t) { await hd.addEvent(t.id, 'auto_resolve', 'system', 'Collector heartbeat restored; backlog replaying'); await hd.setStatus(t.id, 'Resolved', 'system'); }
  publish('collector.recovered', { collector_id: col.id });
}

// ---- IoT / MQTT telemetry ------------------------------------------------------------------------------
/** Accepts MQTT-style messages (topic + value). Wire an MQTT subscriber (or EMQX webhook) to this function. */
export async function ingestIot(m: { ci_id?: number; device_id?: string; topic: string; value?: number; payload?: any; time?: string }) {
  const ci = m.ci_id ? await one('SELECT * FROM config_items WHERE id=$1', [m.ci_id]) : await one(`SELECT * FROM config_items WHERE serial=$1 OR hostname=$1`, [m.device_id]);
  if (!ci) throw new Error('unknown device');
  const metric = m.topic.split('/').pop()!;
  const time = m.time ? new Date(m.time) : new Date();
  await q('INSERT INTO iot_telemetry(time,ci_id,topic,value,payload) VALUES ($1,$2,$3,$4,$5)', [time, ci.id, m.topic, m.value ?? null, m.payload ?? {}]);
  await q('UPDATE config_items SET last_seen=$2 WHERE id=$1', [ci.id, time]);
  if (m.value !== undefined) {
    await q(`INSERT INTO metrics(time,ci_id,metric,avg,min,max,p95,samples) VALUES (date_trunc('minute',$1::timestamptz),$2,$3,$4,$4,$4,$4,1)
      ON CONFLICT (time,ci_id,metric) DO UPDATE SET avg=EXCLUDED.avg, max=GREATEST(metrics.max,EXCLUDED.max), min=LEAST(metrics.min,EXCLUDED.min)`, [time, ci.id, metric, m.value]);
    const ch = await one('SELECT * FROM checks WHERE ci_id=$1 AND metric=$2', [ci.id, metric]);
    if (ch) {
      const sev = severityFor(m.value, ch.warn, ch.crit, dirFor(metric));
      if (sev) await alerts.raiseAlert({ ci_id: ci.id, metric, severity: sev, value: m.value, message: `${metric} ${sev} (${m.value})` }, time);
      else await alerts.closeAlert(ci.id, metric, time);
    }
  }
  await alerts.closeAlert(ci.id, 'offline', time);
  publish('iot.message', { ci_id: ci.id, topic: m.topic, value: m.value });
  return { ci_id: ci.id };
}

/** IoT staleness: no message for 3x the device interval -> offline warning (MQTT LWT equivalent). */
export async function iotStaleScan(now = new Date()) {
  const rows = await q(`SELECT id, name, COALESCE((attributes->>'interval_sec')::int, 60) iv, last_seen FROM config_items
    WHERE ci_class IN ('IoT','Sensor') AND lifecycle='Deployed'`);
  let n = 0;
  for (const r of rows) {
    if ((now.getTime() - new Date(r.last_seen).getTime()) / 1000 > r.iv * 3) { await alerts.raiseAlert({ ci_id: r.id, metric: 'offline', severity: 'warning', message: `No telemetry for ${r.iv * 3}s` }, now); n++; }
  }
  return n;
}

// ---- Syslog ---------------------------------------------------------------------------------------------
export function parseSyslog(raw: string) {
  const m = /^<(\d{1,3})>(?:\d )?(?:[A-Z][a-z]{2}\s+\d+\s[\d:]+|\d{4}-\d\d-\d\dT[\d:.+Z-]+)?\s*(\S+)\s+(.*)$/s.exec(raw.trim());
  if (!m) return { facility: 1, severity: 6, host: 'unknown', message: raw.trim() };
  const pri = Number(m[1]);
  return { facility: pri >> 3, severity: pri & 7, host: m[2], message: m[3] };
}

export async function handleSyslog(raw: string, srcIp?: string) {
  const p = parseSyslog(raw);
  const ci = await one(`SELECT c.* FROM config_items c WHERE lower(c.hostname)=lower($1) OR lower(c.name)=lower($1)
    OR c.id IN (SELECT ci_id FROM ip_addresses WHERE host(ip)=$2)`, [p.host, srcIp ?? '']);
  await q('INSERT INTO syslog_events(host,severity,facility,message,ci_id) VALUES ($1,$2,$3,$4,$5)', [p.host, p.severity, p.facility, p.message, ci?.id ?? null]);
  if (!ci) return { matched: false };
  if (/link.*\bup\b|%LINK-3-UPDOWN.*up/i.test(p.message)) await alerts.closeAlert(ci.id, 'link_state');
  else if (/link.*down|UPDOWN.*down/i.test(p.message)) await alerts.raiseAlert({ ci_id: ci.id, metric: 'link_state', severity: 'warning', message: p.message.slice(0, 120) });
  else if (/power (supply )?fail|fan fail|over.?temp/i.test(p.message) || p.severity <= 2) await alerts.raiseAlert({ ci_id: ci.id, metric: 'hardware', severity: 'critical', message: p.message.slice(0, 120) });
  publish('syslog', { ci_id: ci.id, severity: p.severity, message: p.message });
  return { matched: true, ci_id: ci.id };
}

export async function pruneMetrics(rawDays = 30) {
  const r = await q(`DELETE FROM metrics WHERE time < now() - ($1 || ' days')::interval RETURNING 1`, [String(rawDays)]);
  await q(`DELETE FROM iot_telemetry WHERE time < now() - ($1 || ' days')::interval`, [String(rawDays)]);
  return r.length;
}

/** Roll-up read path: time_bucket-style aggregation over the 1-minute series (TimescaleDB continuous aggregates replace this at scale). */
export async function series(ciId: number, metric: string, minutes = 60, bucketSec = 60) {
  return q(`SELECT to_timestamp(floor(extract(epoch from time)/$4)*$4) t, avg(avg)::float avg, max(max)::float max, min(min)::float min
    FROM metrics WHERE ci_id=$1 AND metric=$2 AND time > now() - ($3 || ' minutes')::interval GROUP BY 1 ORDER BY 1`, [ciId, metric, String(minutes), bucketSec]);
}
