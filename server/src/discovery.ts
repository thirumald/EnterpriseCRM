import { q, one, audit } from './db.ts';
import { publish } from './events.ts';
import * as hd from './helpdesk.ts';
import * as cmdb from './cmdb.ts';
import { TEMPLATES } from './templates.ts';

export interface Found { ip?: string; mac?: string; serial?: string; hostname?: string; ci_class?: string; vendor?: string; model?: string; os?: string }

export async function applyTemplate(ciId: number, ciClass: string) {
  for (const t of TEMPLATES[ciClass] ?? [])
    await q(`INSERT INTO checks(ci_id,metric,protocol,warn,crit,sustain_samples) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING`, [ciId, t.metric, t.protocol, t.warn, t.crit, t.sustain ?? 3]);
}

async function subnetFor(ip: string) {
  return one(`SELECT * FROM subnets WHERE $1::inet << cidr ORDER BY masklen(cidr) DESC LIMIT 1`, [ip]);
}

/** Process discovery results from a Sub-DC scan: reconcile -> create/update CI -> IPAM -> monitor template -> rules R15/R16/R17. */
export async function processDiscovery(siteId: number, found: Found[], source = 'scan') {
  const out = { created: [] as any[], updated: [] as any[], conflicts: [] as any[], rogue: [] as any[] };
  for (const d of found) {
    const subnet = d.ip ? await subnetFor(d.ip) : undefined;
    // R17: IP already bound to a different MAC
    if (d.ip && d.mac) {
      const holder = await one(`SELECT * FROM ip_addresses WHERE ip=$1::inet AND mac IS NOT NULL AND lower(mac)<>lower($2)`, [d.ip, d.mac]);
      if (holder) {
        const t = await hd.createTicket({ subject: `IP conflict on ${d.ip}`, description: `${d.ip} registered to ${holder.mac} but also answered by ${d.mac}.`, priority: 'P2', channel: 'alert', queue: 'Network Ops' });
        await q('INSERT INTO workflow_executions(rule_code,trigger,subject,outcome) VALUES ($1,$2,$3,$4)', ['R17', 'discovery', d.ip, `ticket ${t.number}`]);
        out.conflicts.push({ ip: d.ip, macs: [holder.mac, d.mac], ticket: t.number });
        continue;
      }
    }
    const existing = await cmdb.reconcile(d);
    if (existing) {
      await q(`UPDATE config_items SET last_seen=now(), hostname=COALESCE(hostname,$2), mac=COALESCE(mac,$3),
        attributes = attributes || $4::jsonb WHERE id=$1`, [existing, d.hostname ?? null, d.mac ?? null, JSON.stringify({ os: d.os, vendor: d.vendor, model: d.model })]);
      out.updated.push(existing);
      continue;
    }
    const known = d.ci_class && TEMPLATES[d.ci_class];
    const ciClass = known ? d.ci_class! : 'Unknown';
    const ci = await one(`INSERT INTO config_items(ci_class,name,serial,mac,hostname,site_id,lifecycle,criticality,attributes,discovered_by)
      VALUES ($1,$2,$3,$4,$5,$6,'Pending Review','Medium',$7,$8) RETURNING *`,
      [ciClass, d.hostname ?? d.ip ?? d.mac ?? 'unknown', d.serial ?? null, d.mac ?? null, d.hostname ?? null, siteId, JSON.stringify({ vendor: d.vendor, model: d.model, os: d.os }), source]);
    await q('INSERT INTO lifecycle_events(ci_id,from_stage,to_stage,actor) VALUES ($1,NULL,$2,$3)', [ci.id, 'Pending Review', source]);
    if (d.ip && subnet) await q(`INSERT INTO ip_addresses(subnet_id,ip,ci_id,mac,state) VALUES ($1,$2::inet,$3,$4,'used') ON CONFLICT (ip) DO UPDATE SET ci_id=EXCLUDED.ci_id, mac=EXCLUDED.mac, state='used'`, [subnet.id, d.ip, ci.id, d.mac ?? null]);
    if (known) await applyTemplate(ci.id, ciClass);
    await q('INSERT INTO workflow_executions(rule_code,trigger,subject,outcome) VALUES ($1,$2,$3,$4)', ['R15', 'discovery', ci.name, `CI ${ci.id} created (Pending Review)${known ? ' + monitor template' : ''}`]);
    out.created.push(ci);
    if (!known) { // R16: not identifiable -> security review
      const t = await hd.createTicket({ subject: `Unidentified device on managed network: ${d.ip ?? d.mac}`, description: JSON.stringify(d), priority: 'P3', type: 'Security', channel: 'alert', ci_id: ci.id, queue: 'Network Ops' });
      await q('INSERT INTO workflow_executions(rule_code,trigger,subject,outcome) VALUES ($1,$2,$3,$4)', ['R16', 'discovery', ci.name, `security ticket ${t.number}`]);
      out.rogue.push({ ci_id: ci.id, ticket: t.number });
    }
    publish('ci.discovered', { ci_id: ci.id, name: ci.name });
  }
  await audit(source, 'discovery', 'site', siteId, { created: out.created.length, updated: out.updated.length });
  return out;
}

/** Demo scan source standing in for ICMP/ARP/SNMP/LLDP sweeps run by a Sub-DC collector. */
export function simulatedScan(siteId: number): Found[] {
  const n = Math.floor(Math.random() * 9000) + 1000;
  return [
    { ip: `10.${siteId}.1.${100 + (n % 100)}`, mac: `aa:bb:cc:${(n % 255).toString(16).padStart(2, '0')}:01:02`, serial: `SN-NEW-${n}`, hostname: `srv-new-${n}`, ci_class: 'Server', vendor: 'Dell', model: 'PowerEdge R650', os: 'Ubuntu 22.04' },
    { ip: `10.${siteId}.1.${50 + (n % 40)}`, mac: `de:ad:be:${(n % 255).toString(16).padStart(2, '0')}:ef:01`, hostname: `unknown-${n}`, vendor: '?' },
  ];
}
