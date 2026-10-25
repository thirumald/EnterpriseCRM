import express, { type Request, type Response, type NextFunction } from 'express';
import { q, one, audit } from './db.ts';
import { sseHandler, publish } from './events.ts';
import * as hd from './helpdesk.ts';
import * as cmdb from './cmdb.ts';
import * as mon from './monitoring.ts';
import * as al from './alerts.ts';
import * as sla from './slaService.ts';
import * as disc from './discovery.ts';
import * as rt from './runtime.ts';
import { activeFaults } from './sim.ts';
import { priorityFor } from './sla.ts';

const wrap = (fn: (req: Request, res: Response) => Promise<any>) => (req: Request, res: Response, next: NextFunction) => fn(req, res).then((r) => { if (r !== undefined && !res.headersSent) res.json(r); }).catch(next);
const actor = (req: Request) => String(req.header('x-user') ?? 'anonymous');
const id = (req: Request) => Number(req.params.id);

export function buildRouter() {
  const r = express.Router();
  r.get('/health', wrap(async () => ({ ok: true, time: new Date().toISOString() })));
  r.get('/events', sseHandler);
  r.get('/meta', wrap(async () => ({
    statuses: hd.STATUSES, queues: Object.keys(hd.AGENTS), agents: hd.AGENTS, priorities: ['P1', 'P2', 'P3', 'P4'],
    ciClasses: ['Server', 'VM', 'Switch', 'Router', 'Firewall', 'Endpoint', 'IoT', 'UPS', 'Storage'],
    lifecycle: ['Planned', 'In Stock', 'Pending Review', 'Deployed', 'Maintenance', 'Degraded', 'Retired', 'Disposed'] })));

  // ---------------- CRM ----------------
  r.get('/accounts', wrap(async () => q(`SELECT a.*, 
      (SELECT count(*)::int FROM tickets t WHERE t.account_id=a.id AND t.status NOT IN ('Resolved','Closed')) open_tickets,
      (SELECT count(*)::int FROM config_items c WHERE c.owner_account_id=a.id) assets,
      (SELECT max(end_date) FROM contracts c WHERE c.account_id=a.id AND c.status='active') contract_end,
      (SELECT coalesce(sum(value),0) FROM contracts c WHERE c.account_id=a.id AND c.status='active') contract_value
      FROM accounts a ORDER BY a.name`)));
  r.post('/accounts', wrap(async (req) => {
    const b = req.body;
    const a = await one('INSERT INTO accounts(name,tier,industry,owner,email_domain,parent_id) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *', [b.name, b.tier ?? 'Silver', b.industry ?? null, b.owner ?? null, b.email_domain ?? null, b.parent_id ?? null]);
    await audit(actor(req), 'create', 'account', a.id); return a;
  }));
  r.patch('/accounts/:id', wrap(async (req) => {
    const b = req.body;
    return one(`UPDATE accounts SET name=COALESCE($2,name), tier=COALESCE($3,tier), industry=COALESCE($4,industry), owner=COALESCE($5,owner), email_domain=COALESCE($6,email_domain) WHERE id=$1 RETURNING *`,
      [id(req), b.name ?? null, b.tier ?? null, b.industry ?? null, b.owner ?? null, b.email_domain ?? null]);
  }));
  r.get('/accounts/:id', wrap(async (req) => {
    const aid = id(req);
    const account = await one('SELECT * FROM accounts WHERE id=$1', [aid]);
    if (!account) return void req.res!.status(404).json({ error: 'not found' });
    const [contacts, contracts, assets, tickets, alerts, opportunities, activities, children, sites] = await Promise.all([
      q('SELECT * FROM contacts WHERE account_id=$1 ORDER BY name', [aid]),
      q(`SELECT c.*, p.name policy_name, p.tier policy_tier, (SELECT count(*)::int FROM contract_covered_ci x WHERE x.contract_id=c.id) covered_assets FROM contracts c JOIN sla_policies p ON p.id=c.sla_policy_id WHERE c.account_id=$1 ORDER BY end_date`, [aid]),
      q(`SELECT ci.id, ci.name, ci.ci_class, ci.state, ci.criticality, ci.lifecycle, s.name site,
          EXISTS(SELECT 1 FROM contract_covered_ci cc JOIN contracts k ON k.id=cc.contract_id WHERE cc.ci_id=ci.id AND k.status='active') covered,
          (SELECT min(end_date) FROM warranties w WHERE w.ci_id=ci.id) warranty_end
        FROM config_items ci LEFT JOIN sites s ON s.id=ci.site_id WHERE ci.owner_account_id=$1 ORDER BY ci.name`, [aid]),
      q(`SELECT id,number,subject,priority,status,sla_breached,created_at,ci_id FROM tickets WHERE account_id=$1 ORDER BY created_at DESC LIMIT 50`, [aid]),
      q(`SELECT a.*, c.name ci_name FROM alerts a JOIN config_items c ON c.id=a.ci_id WHERE a.state<>'closed' AND (c.owner_account_id=$1 OR c.id IN (SELECT ci_id FROM ci_account_impact WHERE account_id=$1)) ORDER BY a.first_seen DESC`, [aid]),
      q('SELECT * FROM opportunities WHERE account_id=$1 ORDER BY close_date NULLS LAST', [aid]),
      q('SELECT * FROM activities WHERE account_id=$1 ORDER BY at DESC LIMIT 30', [aid]),
      q('SELECT id,name,tier FROM accounts WHERE parent_id=$1', [aid]),
      q('SELECT * FROM sites WHERE account_id=$1', [aid]),
    ]);
    const stats = await one(`SELECT count(*)::int total_30d,
      count(*) FILTER (WHERE sla_breached)::int breached_30d,
      round(avg(csat)::numeric,2)::float csat_avg
      FROM tickets WHERE account_id=$1 AND created_at > now()-interval '30 days'`, [aid]);
    const attainment = stats.total_30d ? Math.round(100 * (1 - stats.breached_30d / stats.total_30d)) : 100;
    return { account, contacts, contracts, assets, tickets, alerts, opportunities, activities, children, sites, stats: { ...stats, sla_attainment: attainment } };
  }));
  r.post('/accounts/:id/contacts', wrap(async (req) => one('INSERT INTO contacts(account_id,name,email,phone,role) VALUES ($1,$2,$3,$4,$5) RETURNING *', [id(req), req.body.name, req.body.email, req.body.phone ?? null, req.body.role ?? null])));
  r.post('/accounts/:id/activities', wrap(async (req) => one('INSERT INTO activities(account_id,kind,note,actor) VALUES ($1,$2,$3,$4) RETURNING *', [id(req), req.body.kind ?? 'note', req.body.note, actor(req)])));
  r.get('/contracts', wrap(async () => q(`SELECT c.*, a.name account_name, p.name policy_name, p.tier FROM contracts c JOIN accounts a ON a.id=c.account_id JOIN sla_policies p ON p.id=c.sla_policy_id ORDER BY c.end_date`)));
  r.post('/contracts', wrap(async (req) => {
    const b = req.body;
    const c = await one(`INSERT INTO contracts(account_id,name,sla_policy_id,start_date,end_date,value) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`, [b.account_id, b.name, b.sla_policy_id, b.start_date, b.end_date, b.value ?? 0]);
    for (const ci of b.ci_ids ?? []) await q('INSERT INTO contract_covered_ci(contract_id,ci_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [c.id, ci]);
    await audit(actor(req), 'create', 'contract', c.id); return c;
  }));
  r.post('/contracts/:id/coverage', wrap(async (req) => {
    for (const ci of req.body.ci_ids ?? []) await q('INSERT INTO contract_covered_ci(contract_id,ci_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [id(req), ci]);
    return { ok: true };
  }));
  r.get('/opportunities', wrap(async () => q(`SELECT o.*, a.name account_name FROM opportunities o JOIN accounts a ON a.id=o.account_id ORDER BY o.close_date NULLS LAST`)));
  r.post('/opportunities', wrap(async (req) => one('INSERT INTO opportunities(account_id,name,stage,amount,close_date,source) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *', [req.body.account_id, req.body.name, req.body.stage ?? 'Prospect', req.body.amount ?? 0, req.body.close_date ?? null, req.body.source ?? 'manual'])));
  r.patch('/opportunities/:id', wrap(async (req) => one('UPDATE opportunities SET stage=COALESCE($2,stage), amount=COALESCE($3,amount), close_date=COALESCE($4,close_date) WHERE id=$1 RETURNING *', [id(req), req.body.stage ?? null, req.body.amount ?? null, req.body.close_date ?? null])));
  r.get('/sla/policies', wrap(async () => q('SELECT p.*, c.name calendar_name FROM sla_policies p LEFT JOIN business_calendars c ON c.id=p.calendar_id ORDER BY p.id')));
  r.get('/sla/calendars', wrap(async () => q('SELECT * FROM business_calendars ORDER BY id')));
  r.get('/sites', wrap(async () => q(`SELECT s.*, (SELECT count(*)::int FROM config_items c WHERE c.site_id=s.id) cis,
      (SELECT count(*)::int FROM alerts a JOIN config_items c ON c.id=a.ci_id WHERE c.site_id=s.id AND a.state<>'closed' AND NOT a.suppressed) open_alerts,
      (SELECT count(*)::int FROM alerts a JOIN config_items c ON c.id=a.ci_id WHERE c.site_id=s.id AND a.state<>'closed' AND NOT a.suppressed AND a.severity='critical') critical_alerts,
      (SELECT status FROM collectors k WHERE k.site_id=s.id LIMIT 1) collector_status FROM sites s ORDER BY s.id`)));

  // ---------------- Help Desk ----------------
  r.get('/tickets', wrap(async (req) => {
    const f = req.query as Record<string, string>;
    const w: string[] = []; const p: any[] = [];
    const add = (cond: string, v: any) => { p.push(v); w.push(cond.replaceAll('?', `$${p.length}`)); };
    if (f.status === 'active') w.push(`t.status NOT IN ('Resolved','Closed')`); else if (f.status) add('t.status = ?', f.status);
    if (f.priority) add('t.priority = ?', f.priority);
    if (f.queue) add('t.queue = ?', f.queue);
    if (f.assignee) add('t.assignee = ?', f.assignee);
    if (f.account_id) add('t.account_id = ?', Number(f.account_id));
    if (f.ci_id) add('t.ci_id = ?', Number(f.ci_id));
    if (f.breached === 'true') w.push('t.sla_breached');
    if (f.q) add(`(t.subject ILIKE ? OR t.number ILIKE ?)`, `%${f.q}%`);
    const sql = `SELECT t.*, a.name account_name, a.tier account_tier, ci.name ci_name,
      (SELECT due_at FROM sla_timers s WHERE s.ticket_id=t.id AND s.kind='resolution') resolution_due,
      (SELECT state FROM sla_timers s WHERE s.ticket_id=t.id AND s.kind='resolution') resolution_state,
      (SELECT due_at FROM sla_timers s WHERE s.ticket_id=t.id AND s.kind='response') response_due,
      (SELECT state FROM sla_timers s WHERE s.ticket_id=t.id AND s.kind='response') response_state
      FROM tickets t LEFT JOIN accounts a ON a.id=t.account_id LEFT JOIN config_items ci ON ci.id=t.ci_id
      ${w.length ? 'WHERE ' + w.join(' AND ') : ''} ORDER BY CASE t.priority WHEN 'P1' THEN 1 WHEN 'P2' THEN 2 WHEN 'P3' THEN 3 ELSE 4 END, t.created_at DESC LIMIT 300`;
    return q(sql, p);
  }));
  r.post('/tickets', wrap(async (req) => {
    const b = req.body;
    if (!b.subject) return void req.res!.status(400).json({ error: 'subject required' });
    const priority = b.priority ?? (b.urgency && b.impact ? priorityFor(b.urgency, b.impact) : 'P3');
    return hd.createTicket({ ...b, priority, actor: actor(req) });
  }));
  // Public API channel with idempotency
  r.post('/v1/tickets', wrap(async (req) => {
    const key = req.header('idempotency-key');
    if (key) {
      const prev = await one(`SELECT entity_id FROM audit_log WHERE entity='idempotency' AND action=$1`, [key]);
      if (prev) return hd.getTicket(Number(prev.entity_id));
    }
    const b = req.body;
    if (!b.subject) return void req.res!.status(400).json({ error: 'subject required' });
    const t = await hd.createTicket({ subject: b.subject, description: b.description, priority: b.priority ?? 'P3', account_id: b.account_id ?? null, ci_id: b.ci_id ?? null, channel: 'api', actor: 'api' });
    if (key) await audit('api', key, 'idempotency', t.id);
    req.res!.status(201); return t;
  }));
  r.post('/inbound/email', wrap(async (req) => hd.inboundEmail(req.body)));
  r.get('/tickets/:id', wrap(async (req) => {
    const t = await hd.getTicket(id(req));
    if (!t) return void req.res!.status(404).json({ error: 'not found' });
    const [events, alerts, children, kb, related] = await Promise.all([
      hd.ticketEvents(t.id),
      q('SELECT * FROM alerts WHERE ticket_id=$1 ORDER BY first_seen', [t.id]),
      q('SELECT id,number,subject,account_id,status,priority FROM tickets WHERE parent_ticket_id=$1', [t.id]),
      t.subject ? q(`SELECT id,title FROM kb_articles WHERE title ILIKE ANY($1) OR $2 && tags LIMIT 5`, [t.subject.split(/\W+/).filter((w: string) => w.length > 4).map((w: string) => `%${w}%`), (t.ci_class ? [String(t.ci_class).toLowerCase()] : [])]) : [],
      t.ci_id ? q(`SELECT id,number,subject,status FROM tickets WHERE ci_id=$1 AND id<>$2 ORDER BY created_at DESC LIMIT 5`, [t.ci_id, t.id]) : [],
    ]);
    return { ...t, events, alerts, children, kb, related };
  }));
  r.post('/tickets/:id/reply', wrap(async (req) => { await hd.reply(id(req), req.body.kind ?? 'agent', actor(req), req.body.body); return hd.getTicket(id(req)); }));
  r.post('/tickets/:id/status', wrap(async (req) => hd.setStatus(id(req), req.body.status, actor(req))));
  r.post('/tickets/:id/priority', wrap(async (req) => hd.setPriority(id(req), req.body.priority, actor(req))));
  r.post('/tickets/:id/assign', wrap(async (req) => hd.assign(id(req), req.body.assignee, req.body.queue, actor(req))));
  r.post('/tickets/:id/ack', wrap(async (req) => { await sla.markMet(id(req), 'response'); await hd.addEvent(id(req), 'ack', actor(req), 'Acknowledged'); const t = await hd.getTicket(id(req)); if (t.status === 'New') return hd.setStatus(id(req), 'Open', actor(req)); return t; }));
  r.post('/tickets/:id/merge', wrap(async (req) => hd.mergeTickets(id(req), Number(req.body.target_id), actor(req))));
  r.post('/tickets/:id/csat', wrap(async (req) => hd.submitCsat(id(req), Number(req.body.score))));
  r.get('/kb', wrap(async (req) => q(`SELECT * FROM kb_articles WHERE $1='' OR title ILIKE '%'||$1||'%' OR body ILIKE '%'||$1||'%' ORDER BY id`, [String(req.query.q ?? '')])));
  r.post('/kb', wrap(async (req) => one('INSERT INTO kb_articles(title,body,tags) VALUES ($1,$2,$3) RETURNING *', [req.body.title, req.body.body, req.body.tags ?? []])));
  r.post('/admin/sla-tick', wrap(async (req) => { await sla.slaTick(req.body?.now ? new Date(req.body.now) : new Date()); return { ok: true }; }));

  // ---------------- CMDB / IPAM ----------------
  r.get('/cis', wrap(async (req) => {
    const f = req.query as Record<string, string>;
    const w: string[] = []; const p: any[] = [];
    if (f.class) { p.push(f.class); w.push(`c.ci_class=$${p.length}`); }
    if (f.site_id) { p.push(Number(f.site_id)); w.push(`c.site_id=$${p.length}`); }
    if (f.account_id) { p.push(Number(f.account_id)); w.push(`c.owner_account_id=$${p.length}`); }
    if (f.state) { p.push(f.state); w.push(`c.state=$${p.length}`); }
    if (f.lifecycle) { p.push(f.lifecycle); w.push(`c.lifecycle=$${p.length}`); }
    if (f.q) { p.push(`%${f.q}%`); w.push(`(c.name ILIKE $${p.length} OR c.serial ILIKE $${p.length} OR c.hostname ILIKE $${p.length})`); }
    return q(`SELECT c.*, s.name site_name, a.name account_name,
      (SELECT host(ip) FROM ip_addresses i WHERE i.ci_id=c.id LIMIT 1) ip,
      (SELECT min(end_date) FROM warranties w WHERE w.ci_id=c.id) warranty_end,
      (SELECT count(*)::int FROM alerts x WHERE x.ci_id=c.id AND x.state<>'closed' AND NOT x.suppressed) open_alerts
      FROM config_items c LEFT JOIN sites s ON s.id=c.site_id LEFT JOIN accounts a ON a.id=c.owner_account_id
      ${w.length ? 'WHERE ' + w.join(' AND ') : ''} ORDER BY c.name LIMIT 500`, p);
  }));
  r.post('/cis', wrap(async (req) => {
    const b = req.body;
    const ci = await one(`INSERT INTO config_items(ci_class,name,serial,mac,hostname,site_id,owner_account_id,lifecycle,criticality,attributes,discovered_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'manual') RETURNING *`, [b.ci_class, b.name, b.serial ?? null, b.mac ?? null, b.hostname ?? null, b.site_id ?? null, b.owner_account_id ?? null, b.lifecycle ?? 'Planned', b.criticality ?? 'Medium', b.attributes ?? {}]);
    await q('INSERT INTO lifecycle_events(ci_id,from_stage,to_stage,actor) VALUES ($1,NULL,$2,$3)', [ci.id, ci.lifecycle, actor(req)]);
    if (b.apply_template !== false) await disc.applyTemplate(ci.id, ci.ci_class);
    if (b.ip) { const sn = await one('SELECT id FROM subnets WHERE $1::inet << cidr ORDER BY masklen(cidr) DESC LIMIT 1', [b.ip]); if (sn) await q(`INSERT INTO ip_addresses(subnet_id,ip,ci_id,mac) VALUES ($1,$2,$3,$4) ON CONFLICT (ip) DO UPDATE SET ci_id=EXCLUDED.ci_id`, [sn.id, b.ip, ci.id, b.mac ?? null]); }
    if (b.warranty_end) await q('INSERT INTO warranties(ci_id,vendor,support_level,start_date,end_date) VALUES ($1,$2,$3,$4,$5)', [ci.id, b.vendor ?? null, b.support_level ?? null, b.warranty_start ?? null, b.warranty_end]);
    await audit(actor(req), 'create', 'ci', ci.id); return ci;
  }));
  r.get('/cis/:id', wrap(async (req) => {
    const cid = id(req);
    const ci = await one(`SELECT c.*, s.name site_name, a.name account_name FROM config_items c LEFT JOIN sites s ON s.id=c.site_id LEFT JOIN accounts a ON a.id=c.owner_account_id WHERE c.id=$1`, [cid]);
    if (!ci) return void req.res!.status(404).json({ error: 'not found' });
    const [dependsOn, dependents, warranties, ips, checks, alerts, tickets, contracts, lifecycle, impact] = await Promise.all([
      q(`SELECT c.id,c.name,c.ci_class,c.state,r.rel_type,r.attrs FROM ci_relationships r JOIN config_items c ON c.id=r.to_ci WHERE r.from_ci=$1`, [cid]),
      q(`SELECT c.id,c.name,c.ci_class,c.state,r.rel_type,r.attrs FROM ci_relationships r JOIN config_items c ON c.id=r.from_ci WHERE r.to_ci=$1`, [cid]),
      q('SELECT * FROM warranties WHERE ci_id=$1', [cid]),
      q('SELECT i.*, host(i.ip) ip_text, s.cidr::text cidr, s.vlan FROM ip_addresses i JOIN subnets s ON s.id=i.subnet_id WHERE i.ci_id=$1', [cid]),
      q('SELECT * FROM checks WHERE ci_id=$1 ORDER BY metric', [cid]),
      q('SELECT * FROM alerts WHERE ci_id=$1 ORDER BY first_seen DESC LIMIT 20', [cid]),
      q('SELECT id,number,subject,status,priority,created_at FROM tickets WHERE ci_id=$1 ORDER BY created_at DESC LIMIT 20', [cid]),
      q(`SELECT k.id,k.name,k.status,k.end_date,p.name policy FROM contract_covered_ci cc JOIN contracts k ON k.id=cc.contract_id JOIN sla_policies p ON p.id=k.sla_policy_id WHERE cc.ci_id=$1`, [cid]),
      q('SELECT * FROM lifecycle_events WHERE ci_id=$1 ORDER BY at DESC', [cid]),
      cmdb.impact(cid),
    ]);
    return { ...ci, dependsOn, dependents, warranties, ips, checks, alerts, tickets, contracts, lifecycle_events: lifecycle, impact };
  }));
  r.patch('/cis/:id', wrap(async (req) => {
    const b = req.body;
    const ci = await one(`UPDATE config_items SET name=COALESCE($2,name), site_id=COALESCE($3,site_id), owner_account_id=COALESCE($4,owner_account_id), criticality=COALESCE($5,criticality),
      attributes=attributes||COALESCE($6::jsonb,'{}'::jsonb) WHERE id=$1 RETURNING *`, [id(req), b.name ?? null, b.site_id ?? null, b.owner_account_id ?? null, b.criticality ?? null, b.attributes ? JSON.stringify(b.attributes) : null]);
    await audit(actor(req), 'update', 'ci', id(req), b); return ci;
  }));
  r.post('/cis/:id/lifecycle', wrap(async (req) => { await cmdb.setLifecycle(id(req), req.body.stage, actor(req)); return one('SELECT * FROM config_items WHERE id=$1', [id(req)]); }));
  r.get('/cis/:id/impact', wrap(async (req) => cmdb.impact(id(req))));
  r.get('/cis/:id/series', wrap(async (req) => mon.series(id(req), String(req.query.metric ?? 'cpu'), Number(req.query.minutes ?? 60), Number(req.query.bucket ?? 60))));
  r.get('/cis/:id/iot', wrap(async (req) => q('SELECT time, topic, value FROM iot_telemetry WHERE ci_id=$1 ORDER BY time DESC LIMIT 100', [id(req)])));
  r.post('/relationships', wrap(async (req) => one(`INSERT INTO ci_relationships(from_ci,to_ci,rel_type,attrs) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING RETURNING *`, [req.body.from_ci, req.body.to_ci, req.body.rel_type ?? 'DEPENDS_ON', req.body.attrs ?? {}])));
  r.delete('/relationships/:id', wrap(async (req) => { await q('DELETE FROM ci_relationships WHERE id=$1', [id(req)]); return { ok: true }; }));
  r.get('/topology', wrap(async (req) => {
    const site = req.query.site_id ? Number(req.query.site_id) : null;
    const nodes = await q(`SELECT c.id,c.name,c.ci_class,c.state,c.criticality,c.site_id,c.owner_account_id,
        (SELECT count(*)::int FROM alerts a WHERE a.ci_id=c.id AND a.state<>'closed' AND NOT a.suppressed) alerts FROM config_items c
        WHERE c.lifecycle NOT IN ('Retired','Disposed') AND ($1::int IS NULL OR c.site_id=$1 OR c.id IN (SELECT to_ci FROM ci_relationships WHERE from_ci IN (SELECT id FROM config_items WHERE site_id=$1)) OR c.id IN (SELECT from_ci FROM ci_relationships WHERE to_ci IN (SELECT id FROM config_items WHERE site_id=$1)))`, [site]);
    const ids = nodes.map((n: any) => n.id);
    const edges = await q('SELECT id, from_ci, to_ci, rel_type, attrs FROM ci_relationships WHERE from_ci = ANY($1) AND to_ci = ANY($1)', [ids]);
    return { nodes, edges };
  }));
  r.get('/warranties', wrap(async (req) => q(`SELECT w.*, c.name ci_name, c.ci_class, a.name account_name, (w.end_date - CURRENT_DATE)::int days_left
      FROM warranties w JOIN config_items c ON c.id=w.ci_id LEFT JOIN accounts a ON a.id=c.owner_account_id
      WHERE ($1::int IS NULL OR (w.end_date - CURRENT_DATE) <= $1) ORDER BY w.end_date`, [req.query.within_days ? Number(req.query.within_days) : null])));
  r.get('/ipam/subnets', wrap(async () => cmdb.ipamUtilisation()));
  r.post('/ipam/subnets', wrap(async (req) => one('INSERT INTO subnets(cidr,name,vlan,site_id) VALUES ($1,$2,$3,$4) RETURNING *', [req.body.cidr, req.body.name, req.body.vlan ?? null, req.body.site_id ?? null])));
  r.get('/ipam/subnets/:id/ips', wrap(async (req) => q(`SELECT i.id, host(i.ip) ip, i.mac, i.state, i.ci_id, c.name ci_name FROM ip_addresses i LEFT JOIN config_items c ON c.id=i.ci_id WHERE i.subnet_id=$1 ORDER BY i.ip`, [id(req)])));
  r.post('/ipam/ips', wrap(async (req) => {
    const sn = await one('SELECT id FROM subnets WHERE $1::inet << cidr ORDER BY masklen(cidr) DESC LIMIT 1', [req.body.ip]);
    if (!sn) return void req.res!.status(400).json({ error: 'no matching subnet' });
    const holder = await one(`SELECT * FROM ip_addresses WHERE ip=$1::inet AND state<>'free'`, [req.body.ip]);
    if (holder && holder.ci_id !== (req.body.ci_id ?? null)) return void req.res!.status(409).json({ error: 'IP already assigned', holder });
    return one(`INSERT INTO ip_addresses(subnet_id,ip,ci_id,mac,state) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (ip) DO UPDATE SET ci_id=EXCLUDED.ci_id, mac=EXCLUDED.mac, state=EXCLUDED.state RETURNING *`, [sn.id, req.body.ip, req.body.ci_id ?? null, req.body.mac ?? null, req.body.state ?? 'used']);
  }));
  r.post('/discovery/scan', wrap(async (req) => {
    const siteId = Number(req.body.site_id);
    const found = req.body.found ?? disc.simulatedScan(siteId);
    return disc.processDiscovery(siteId, found, req.body.found ? 'scan' : 'simulated-scan');
  }));
  r.get('/discovery/pending', wrap(async () => q(`SELECT c.*, s.name site_name FROM config_items c LEFT JOIN sites s ON s.id=c.site_id WHERE c.lifecycle='Pending Review' ORDER BY c.id DESC`)));

  // ---------------- Monitoring ----------------
  r.get('/alerts', wrap(async (req) => {
    const state = String(req.query.state ?? 'active');
    return q(`SELECT a.*, c.name ci_name, c.ci_class, c.site_id, c.owner_account_id account_id, s.name site_name, acc.name account_name, t.number ticket_number
      FROM alerts a JOIN config_items c ON c.id=a.ci_id LEFT JOIN sites s ON s.id=c.site_id LEFT JOIN accounts acc ON acc.id=c.owner_account_id LEFT JOIN tickets t ON t.id=a.ticket_id
      WHERE ($1='all' OR ($1='active' AND a.state<>'closed') OR a.state=$1) ORDER BY (a.severity='critical') DESC, a.last_seen DESC LIMIT 300`, [state]);
  }));
  r.post('/alerts/:id/ack', wrap(async (req) => al.ackAlert(id(req), actor(req))));
  r.post('/alerts/:id/ticket', wrap(async (req) => {
    const a = await one('SELECT a.*, c.name ci_name FROM alerts a JOIN config_items c ON c.id=a.ci_id WHERE a.id=$1', [id(req)]);
    if (a.ticket_id) return hd.getTicket(a.ticket_id);
    const t = await hd.createTicket({ subject: `${a.ci_name}: ${a.message}`, priority: req.body.priority ?? 'P3', channel: 'agent', ci_id: a.ci_id, source_alert_id: a.id, actor: actor(req) });
    await q('UPDATE alerts SET ticket_id=$2 WHERE id=$1', [a.id, t.id]); return t;
  }));
  r.get('/collectors', wrap(async () => q(`SELECT k.*, s.name site_name,
      CASE WHEN k.raw_samples_total>0 THEN round((100.0*(1 - k.forwarded_points_total::numeric/k.raw_samples_total)),1)::float ELSE 0 END bandwidth_saved_pct
      FROM collectors k JOIN sites s ON s.id=k.site_id ORDER BY k.id`)));
  r.post('/collectors/:id/wan', wrap(async (req) => { await rt.setWan(id(req), !!req.body.up); if (req.body.up) { const c = rt.collectors.get(id(req)); await c?.drain(); } return { ok: true, up: !!req.body.up }; }));
  r.post('/ingest/batch', wrap(async (req) => mon.ingestBatch(req.body)));
  r.post('/ingest/iot', wrap(async (req) => mon.ingestIot(req.body)));
  r.post('/ingest/syslog', express.text({ type: '*/*' }), wrap(async (req) => mon.handleSyslog(typeof req.body === 'string' ? req.body : req.body?.message ?? '', req.ip)));
  r.get('/syslog', wrap(async () => q(`SELECT s.*, c.name ci_name FROM syslog_events s LEFT JOIN config_items c ON c.id=s.ci_id ORDER BY s.id DESC LIMIT 100`)));
  r.get('/checks', wrap(async (req) => q('SELECT * FROM checks WHERE ci_id=$1', [Number(req.query.ci_id)])));
  r.patch('/checks/:id', wrap(async (req) => {
    const c = await one('UPDATE checks SET warn=$2, crit=$3, sustain_samples=COALESCE($4,sustain_samples) WHERE id=$1 RETURNING *', [id(req), req.body.warn ?? null, req.body.crit ?? null, req.body.sustain_samples ?? null]);
    for (const col of rt.collectors.values()) await col.reloadConfig();
    await audit(actor(req), 'update', 'check', id(req), req.body); return c;
  }));
  r.get('/maintenance', wrap(async () => q(`SELECT m.*, c.name ci_name, s.name site_name FROM maintenance_windows m LEFT JOIN config_items c ON c.id=m.ci_id LEFT JOIN sites s ON s.id=m.site_id ORDER BY start_at DESC`)));
  r.post('/maintenance', wrap(async (req) => one(`INSERT INTO maintenance_windows(name,ci_id,site_id,start_at,end_at,suppress_alerts,pause_sla) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`, [req.body.name, req.body.ci_id ?? null, req.body.site_id ?? null, req.body.start_at, req.body.end_at, req.body.suppress_alerts ?? true, req.body.pause_sla ?? false])));
  r.delete('/maintenance/:id', wrap(async (req) => { await q('DELETE FROM maintenance_windows WHERE id=$1', [id(req)]); return { ok: true }; }));
  // fault injection for demos / game days
  r.get('/sim/faults', wrap(async () => activeFaults()));
  r.post('/sim/fault', wrap(async (req) => { rt.injectFault(Number(req.body.ci_id), req.body.metric, req.body.value); return { ok: true }; }));
  r.post('/sim/clear', wrap(async (req) => { rt.clearFault(Number(req.body.ci_id), req.body.metric); return { ok: true }; }));
  r.post('/sim/flush', wrap(async () => { for (const c of rt.collectors.values()) { await c.poll(); await c.flush(); } return { ok: true }; }));

  // ---------------- Workflow & notifications ----------------
  r.get('/rules', wrap(async () => q('SELECT * FROM workflow_rules ORDER BY (regexp_replace(code,\'\\D\',\'\',\'g\'))::int')));
  r.patch('/rules/:code', wrap(async (req) => { const x = await one('UPDATE workflow_rules SET enabled=COALESCE($2,enabled), params=COALESCE($3,params) WHERE code=$1 RETURNING *', [req.params.code, req.body.enabled ?? null, req.body.params ?? null]); await audit(actor(req), 'update', 'rule', String(req.params.code), req.body); return x; }));
  r.get('/rules-executions', wrap(async () => q('SELECT * FROM workflow_executions ORDER BY id DESC LIMIT 100')));
  r.get('/notifications', wrap(async () => q('SELECT * FROM notifications ORDER BY id DESC LIMIT 100')));
  r.get('/audit', wrap(async () => q('SELECT * FROM audit_log ORDER BY id DESC LIMIT 100')));

  // ---------------- Dashboards & reports ----------------
  r.get('/dashboard/noc', wrap(async () => {
    const [sev, tix, topCpu, topBw, sla_, iot, majors, cols, byClass] = await Promise.all([
      one(`SELECT count(*) FILTER (WHERE severity='critical')::int critical, count(*) FILTER (WHERE severity='warning')::int warning, count(*) FILTER (WHERE severity='info')::int info FROM alerts WHERE state<>'closed' AND NOT suppressed`),
      one(`SELECT count(*) FILTER (WHERE status NOT IN ('Resolved','Closed'))::int open, count(*) FILTER (WHERE status NOT IN ('Resolved','Closed') AND priority='P1')::int p1,
          count(*) FILTER (WHERE status NOT IN ('Resolved','Closed') AND priority='P2')::int p2, count(*) FILTER (WHERE status NOT IN ('Resolved','Closed') AND sla_breached)::int breached,
          count(*) FILTER (WHERE status='New')::int unacked FROM tickets`),
      q(`SELECT DISTINCT ON (m.ci_id) m.ci_id, c.name, m.avg::float value FROM metrics m JOIN config_items c ON c.id=m.ci_id WHERE m.metric='cpu' AND m.time > now()-interval '15 minutes' ORDER BY m.ci_id, m.time DESC`),
      q(`SELECT DISTINCT ON (m.ci_id) m.ci_id, c.name, m.avg::float value FROM metrics m JOIN config_items c ON c.id=m.ci_id WHERE m.metric='bandwidth' AND m.time > now()-interval '15 minutes' ORDER BY m.ci_id, m.time DESC`),
      one(`SELECT round(100.0*count(*) FILTER (WHERE NOT sla_breached)/GREATEST(count(*),1))::int attainment,
          round(avg(extract(epoch from (resolved_at-created_at))/60) FILTER (WHERE resolved_at IS NOT NULL))::int mttr_min FROM tickets WHERE created_at > now()-interval '30 days'`),
      q(`SELECT c.id,c.name,c.state,c.last_seen,(SELECT value FROM iot_telemetry t WHERE t.ci_id=c.id ORDER BY time DESC LIMIT 1) last_value,(SELECT topic FROM iot_telemetry t WHERE t.ci_id=c.id ORDER BY time DESC LIMIT 1) topic FROM config_items c WHERE c.ci_class IN ('IoT','Sensor') AND lifecycle='Deployed' ORDER BY c.name`),
      q(`SELECT id,number,subject,priority,status,created_at FROM tickets WHERE type='Major Incident' AND status NOT IN ('Resolved','Closed')`),
      q(`SELECT k.id,k.name,k.status,k.wan_up,k.queue_depth,k.last_heartbeat,s.name site_name,
          CASE WHEN k.raw_samples_total>0 THEN round(100.0*(1-k.forwarded_points_total::numeric/k.raw_samples_total),1)::float ELSE 0 END saved_pct FROM collectors k JOIN sites s ON s.id=k.site_id ORDER BY k.id`),
      q(`SELECT ci_class, count(*)::int n, count(*) FILTER (WHERE state='UP')::int up FROM config_items WHERE lifecycle='Deployed' GROUP BY ci_class ORDER BY ci_class`),
    ]);
    return { alerts: sev, tickets: tix, topCpu: topCpu.sort((a: any, b: any) => b.value - a.value).slice(0, 5), topBandwidth: topBw.sort((a: any, b: any) => b.value - a.value).slice(0, 5), sla: sla_, iot, majors, collectors: cols, byClass };
  }));
  r.get('/reports/sla', wrap(async () => q(`SELECT a.id account_id, a.name account, a.tier, count(t.*)::int tickets,
      count(*) FILTER (WHERE t.sla_breached)::int breached,
      CASE WHEN count(t.*)=0 THEN 100 ELSE round(100.0*(1-count(*) FILTER (WHERE t.sla_breached)::numeric/count(t.*)))::int END attainment,
      round(avg(extract(epoch from (t.resolved_at-t.created_at))/60) FILTER (WHERE t.resolved_at IS NOT NULL))::int mttr_min
      FROM accounts a LEFT JOIN tickets t ON t.account_id=a.id AND t.created_at > now()-interval '30 days' GROUP BY a.id ORDER BY attainment, a.name`)));
  r.get('/reports/availability', wrap(async () => q(`SELECT c.id, c.name, c.ci_class, round(100.0*avg(m.avg))::float availability_pct FROM metrics m JOIN config_items c ON c.id=m.ci_id
      WHERE m.metric='availability' AND m.time > now()-interval '24 hours' GROUP BY c.id ORDER BY 4, c.name`)));
  r.get('/reports/pipeline', wrap(async () => q(`SELECT stage, count(*)::int n, coalesce(sum(amount),0)::float amount FROM opportunities GROUP BY stage ORDER BY 1`)));
  r.get('/search', wrap(async (req) => {
    const s = `%${req.query.q ?? ''}%`;
    const [accounts, tickets, cis] = await Promise.all([q('SELECT id,name FROM accounts WHERE name ILIKE $1 LIMIT 5', [s]), q('SELECT id,number,subject FROM tickets WHERE subject ILIKE $1 OR number ILIKE $1 LIMIT 5', [s]), q('SELECT id,name,ci_class FROM config_items WHERE name ILIKE $1 OR hostname ILIKE $1 LIMIT 5', [s])]);
    return { accounts, tickets, cis };
  }));
  return r;
}
export { publish };
