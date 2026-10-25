'use strict';
/* Views, drawers, modals, forms and actions for every module. Depends on app.js (window.APP). */
(function () {
  const A = window.APP, { e, ic, money, moneyFull, initials, fmtDur, ago, fmtDate, daysTo } = A;
  const ui = A.ui, V = A.views, ACT = A.actions, FORMS = A.forms, DR = A.drawers, MO = A.modals;
  const D = () => A.D;

  /* ---------- small UI builders ---------- */
  const head = (t, sub, actions) => `<div class="page-head"><div><h1>${e(t)}</h1>${sub ? `<p>${e(sub)}</p>` : ''}</div><div class="sp"></div>${actions || ''}</div>`;
  const kpi = (icon, val, label, cls) => `<div class="card kpi ${cls || ''}"><div class="ico">${ic(icon, 22)}</div><div><b>${val}</b><span>${e(label)}</span></div></div>`;
  const chip = (txt, cls) => `<span class="chip ${cls || ''}">${e(txt)}</span>`;
  const sevChip = (s) => chip(s, { critical: 'crit', warning: 'warn', info: 'info' }[s]);
  const statusCls = (s) => ({ Open: 'info', 'In progress': 'warn', Pending: '', Resolved: 'ok', Closed: '' }[s] || '');
  const healthCls = (h) => (h < 60 ? 'crit' : h < 80 ? 'warn' : 'ok');
  const barc = (pct, cls) => `<div class="bar ${cls || ''}" role="progressbar" aria-valuenow="${Math.round(pct)}" aria-valuemin="0" aria-valuemax="100"><i style="width:${Math.max(0, Math.min(100, pct))}%"></i></div>`;
  const opts = (list, sel) => list.map((o) => { const v = Array.isArray(o) ? o[0] : o, l = Array.isArray(o) ? o[1] : o; return `<option value="${e(v)}" ${String(v) === String(sel) ? 'selected' : ''}>${e(l)}</option>`; }).join('');
  const fv = (s, k, d) => (ui.f[s] && ui.f[s][k] != null ? ui.f[s][k] : d == null ? '' : d);
  const tabs = (scope, items, def) => { const cur = ui.tab[scope] || def; return `<div class="tabs" role="tablist">${items.map(([k, l]) => `<button role="tab" aria-selected="${k === cur}" class="${k === cur ? 'on' : ''}" data-a="tab" data-scope="${scope}" data-id="${k}">${e(l)}</button>`).join('')}</div>`; };
  const curTab = (scope, def) => ui.tab[scope] || def;
  const empty = (msg) => `<div class="empty">${ic('search', 28)}<p>${e(msg)}</p></div>`;
  const tbl = (cols, rows, cls) => `<div class="tbl-wrap"><table class="${cls || ''}"><thead><tr>${cols.map((c) => `<th ${c[1] ? `class="${c[1]}"` : ''}>${e(c[0])}</th>`).join('')}</tr></thead><tbody>${rows.join('') || `<tr><td colspan="${cols.length}">${empty('Nothing to show')}</td></tr>`}</tbody></table></div>`;
  const field = (label, inner) => `<label class="f"><span>${e(label)}</span>${inner}</label>`;
  const acctLink = (id) => { const a = A.acct(id); return a ? `<a data-a="openAccount" data-id="${a.id}" style="color:var(--brand);cursor:pointer" role="link" tabindex="0">${e(a.name)}</a>` : '-'; };
  const assetLink = (id) => { const a = A.asset(id); return a ? `<a data-a="openAsset" data-id="${a.id}" style="color:var(--brand);cursor:pointer" role="link" tabindex="0">${e(a.name)}</a>` : '-'; };
  const dl = (pairs) => `<dl class="kv">${pairs.map(([k, v]) => `<dt>${e(k)}</dt><dd>${v}</dd>`).join('')}</dl>`;
  const agents = () => D().users.filter((u) => ['agent', 'engineer', 'admin'].includes(u.role) && u.status === 'Active').map((u) => u.name);
  const csv = (rows) => rows.map((r) => r.map((c) => '"' + String(c == null ? '' : c).replace(/"/g, '""') + '"').join(',')).join('\n');
  const download = (name, text, mime) => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: mime || 'text/csv' })); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); };

  /* ---------- charts ---------- */
  function lineSvg(vals, color) {
    const w = 520, h = 150, n = vals.length, max = Math.max.apply(null, vals.concat([1]));
    const px = (i) => 12 + (i * (w - 24)) / (n - 1), py = (v) => h - 16 - (v / max) * (h - 34);
    const pts = vals.map((v, i) => px(i).toFixed(1) + ',' + py(v).toFixed(1)).join(' ');
    return `<svg viewBox="0 0 ${w} ${h}" width="100%" role="img" aria-label="Ticket volume over the last 14 days"><polygon fill="${color}" opacity=".12" points="${px(0)},${h - 16} ${pts} ${px(n - 1)},${h - 16}"/><polyline fill="none" stroke="${color}" stroke-width="2.5" points="${pts}"/>${vals.map((v, i) => `<circle cx="${px(i)}" cy="${py(v)}" r="3" fill="${color}"><title>${v} tickets</title></circle>`).join('')}<text x="12" y="${h - 2}" font-size="10" fill="var(--muted)">14 days ago</text><text x="${w - 12}" y="${h - 2}" font-size="10" text-anchor="end" fill="var(--muted)">today</text></svg>`;
  }
  function donut(parts) {
    const r = 52, c = 2 * Math.PI * r, tot = parts.reduce((s, p) => s + p.v, 0) || 1; let off = 0;
    return `<svg viewBox="0 0 140 140" width="140" height="140" role="img" aria-label="Distribution"><g transform="rotate(-90 70 70)">${parts.map((p) => { const len = (p.v / tot) * c; const s = `<circle cx="70" cy="70" r="${r}" fill="none" stroke="${p.c}" stroke-width="18" stroke-dasharray="${len} ${c - len}" stroke-dashoffset="${-off}"><title>${e(p.l)}: ${p.v}</title></circle>`; off += len; return s; }).join('')}</g><text x="70" y="70" text-anchor="middle" font-size="24" font-weight="700" fill="currentColor">${tot}</text><text x="70" y="88" text-anchor="middle" font-size="10" fill="var(--muted)">total</text></svg>`;
  }
  const legend = (parts) => `<div class="legend" style="flex-direction:column;gap:6px">${parts.map((p) => `<span><i style="background:${p.c}"></i>${e(p.l)} <b style="color:var(--text)">${p.v}</b></span>`).join('')}</div>`;
  const hbars = (items, fmt) => { const max = Math.max.apply(null, items.map((i) => i.v).concat([1])); return `<div class="list">${items.map((i) => `<div><div class="grow"><div class="row small"><span>${e(i.l)}</span><span class="sp"></span><b>${fmt ? fmt(i.v) : i.v}</b></div>${barc((i.v / max) * 100)}</div></div>`).join('')}</div>`; };
  const HIST = (A.HIST = {});
  const spark = (arr, color) => { if (!arr || arr.length < 2) return ''; const w = 90, h = 26, mx = Math.max.apply(null, arr), mn = Math.min.apply(null, arr), rg = mx - mn || 1; return `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-hidden="true"><polyline fill="none" stroke="${color || 'var(--brand)'}" stroke-width="1.8" points="${arr.map((v, i) => ((i * w) / (arr.length - 1)).toFixed(1) + ',' + (h - 3 - ((v - mn) / rg) * (h - 6)).toFixed(1)).join(' ')}"/></svg>`; };

  /* ---------- SLA engine ---------- */
  const SLA = { P1: { resp: 15, res: 240 }, P2: { resp: 60, res: 480 }, P3: { resp: 240, res: 1440 }, P4: { resp: 480, res: 4320 } };
  const TIER = { Gold: 1, Silver: 1.5, Bronze: 2 };
  const PRI = { P1: 'P1 Critical', P2: 'P2 High', P3: 'P3 Medium', P4: 'P4 Low' };
  function sla(t) {
    const acc = A.acct(t.account), k = TIER[acc ? acc.tier : 'Silver'] || 1, tg = SLA[t.pri], now = Date.now();
    const respT = tg.resp * k * 60000, resT = tg.res * k * 60000;
    const paused = (t.pausedMs || 0) + (t.pausedAt && !t.resolvedAt ? now - t.pausedAt : 0);
    const elapsed = (t.resolvedAt || now) - t.created - paused;
    const respEl = (t.firstResponse || now) - t.created;
    const resp = t.firstResponse ? { state: respEl <= respT ? 'met' : 'breached', left: respT - respEl } : { state: respEl > respT ? 'breached' : 'running', left: respT - respEl };
    const res = t.resolvedAt ? { state: elapsed <= resT ? 'met' : 'breached', left: resT - elapsed } : { state: t.pausedAt ? 'paused' : elapsed > resT ? 'breached' : 'running', left: resT - elapsed };
    return { respT, resT, elapsed, resp, res, pct: (elapsed / resT) * 100 };
  }
  A.sla = sla;
  const isOpen = (t) => t.status !== 'Resolved' && t.status !== 'Closed';
  function slaChip(t) {
    const s = sla(t);
    if (!isOpen(t)) return chip(s.res.state === 'met' ? 'Met' : 'Breached', s.res.state === 'met' ? 'ok' : 'crit');
    if (s.res.state === 'paused') return chip('Paused', '');
    if (s.res.state === 'breached') return chip('Breached ' + fmtDur(-s.res.left), 'crit');
    if (s.resp.state === 'breached') return chip('No response ' + fmtDur(-s.resp.left), 'crit');
    return chip(fmtDur(s.res.left) + ' left', s.pct >= 75 ? 'warn' : 'info');
  }
  const slaRisk = (t) => isOpen(t) && (() => { const s = sla(t); return s.res.state === 'breached' || s.resp.state === 'breached' || s.pct >= 75; })();

  /* ---------- domain operations ---------- */
  function createTicket(o) {
    const d = D(), acc = A.acct(o.account);
    let pri = o.pri || 'P3', bumped = false;
    const r19 = d.rules.find((r) => r.id === 'R19');
    if (r19 && r19.enabled && acc && acc.tier === 'Gold' && pri !== 'P1') { pri = 'P' + (Number(pri[1]) - 1); bumped = true; r19.hits++; }
    const t = { id: A.nextId('ticket'), subject: o.subject, account: o.account, pri, status: 'Open', assignee: o.assignee || null, cat: o.cat || 'Application', asset: o.asset || null, source: o.source || 'Portal', created: Date.now(), firstResponse: null, resolvedAt: null, pausedAt: null, pausedMs: 0, csat: null, comments: [] };
    if (o.desc) t.comments.push({ by: o.by || 'Requester', at: Date.now(), text: o.desc, internal: false });
    if (bumped) t.comments.push({ by: 'System', at: Date.now(), text: 'Rule R19 raised priority for a Gold account.', internal: true });
    d.tickets.unshift(t); return t;
  }
  function setStatus(t, s) {
    const now = Date.now();
    if (t.status === 'Pending' && s !== 'Pending' && t.pausedAt) { t.pausedMs = (t.pausedMs || 0) + (now - t.pausedAt); t.pausedAt = null; }
    if (s === 'Pending') t.pausedAt = now;
    if (s === 'In progress' && !t.firstResponse) { t.firstResponse = now; if (!t.assignee) t.assignee = ui.role === 'customer' ? null : A.ROLES[ui.role].user; }
    if (s === 'Resolved') { t.resolvedAt = now; if (!t.firstResponse) t.firstResponse = now; }
    if (s === 'Open' && (t.status === 'Resolved' || t.status === 'Closed')) { t.resolvedAt = null; t.csat = null; }
    t.status = s;
  }
  function upstream(assetId, seen) {
    seen = seen || new Set(); const a = A.asset(assetId); if (!a) return seen;
    a.dep.forEach((id) => { if (!seen.has(id)) { seen.add(id); upstream(id, seen); } }); return seen;
  }
  function downstream(assetId) {
    const out = new Set(), walk = (id) => D().assets.forEach((a) => { if (a.dep.includes(id) && !out.has(a.id)) { out.add(a.id); walk(a.id); } });
    walk(assetId); return [...out].map(A.asset);
  }
  function assetState(a) {
    const al = D().alerts.filter((x) => x.asset === a.id && x.state === 'open' && !x.suppressed);
    return al.some((x) => x.sev === 'critical') ? 'crit' : al.some((x) => x.sev === 'warning') ? 'warn' : a.status === 'Maintenance' ? 'warn' : 'ok';
  }
  function raiseAlert(assetId, sev, msg, source) {
    const d = D(), a = A.asset(assetId), site = A.site(a.site), rule = (id) => d.rules.find((r) => r.id === id);
    const dup = rule('R3').enabled && d.alerts.find((x) => x.asset === assetId && x.msg === msg && x.state !== 'resolved' && Date.now() - x.at < 600000);
    if (dup) { dup.count = (dup.count || 1) + 1; rule('R3').hits++; return { alert: dup, note: 'Duplicate suppressed (R3), count ' + dup.count }; }
    const al = { id: A.nextId('alert'), sev, asset: assetId, msg, source: source || 'threshold', at: Date.now(), state: 'open', ticket: null };
    let note = 'Alert raised on ' + a.name;
    if (rule('R5').enabled && (site.maintenance || a.status === 'Maintenance')) { al.suppressed = 'maintenance'; rule('R5').hits++; note = 'Suppressed by maintenance window (R5)'; }
    else if (rule('R4').enabled && [...upstream(assetId)].some((id) => d.alerts.some((x) => x.asset === id && x.state === 'open' && x.sev === 'critical' && !x.suppressed))) { al.suppressed = 'correlated'; rule('R4').hits++; note = 'Correlated to an upstream outage (R4), no ticket'; }
    else if (sev === 'critical' && rule('R1').enabled) {
      const t = createTicket({ subject: a.name + ': ' + msg, account: a.account, pri: 'P1', cat: a.type === 'Database' ? 'Database' : a.type === 'Server' ? 'Server' : 'Network', asset: assetId, source: 'Alert', by: 'System', desc: 'Created automatically from a critical alert (' + msg + ').' });
      al.ticket = t.id; rule('R1').hits++; note = 'Rule R1 opened ticket #' + t.id;
    }
    d.alerts.unshift(al); return { alert: al, note };
  }
  A.raiseAlert = raiseAlert;

  /* ---------- simulated telemetry (called every few seconds) ---------- */
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  A.tick = function () {
    const d = D(); d.thr = d.thr || { cpu: 85, mem: 90, disk: 90 };
    d.sites.forEach((s) => {
      const h = (HIST['s' + s.id] = HIST['s' + s.id] || Array.from({ length: 24 }, () => s.latency + Math.random() * 6));
      if (s.collector === 'offline') { s.queue += 2 + Math.floor(Math.random() * 6); s.offTicks = (s.offTicks || 0) + 1; if (s.offTicks === 3 && d.rules.find((r) => r.id === 'R6').enabled) { const gw = d.assets.find((a) => a.site === s.id); if (gw) { const r = raiseAlert(gw.id, 'critical', 'Collector heartbeat missed x3 (' + s.name + ')', 'heartbeat'); r.alert.collector = true; } } }
      else { s.offTicks = 0; s.latency = clamp(s.latency + (Math.random() * 6 - 3), 8, 90); s.queue = Math.max(0, s.queue - 12); }
      h.push(s.collector === 'offline' ? 0 : s.latency); if (h.length > 24) h.shift();
    });
    d.assets.forEach((a) => {
      if (a.status === 'Retired') return;
      a.m.cpu = clamp(a.m.cpu + (Math.random() * 6 - 3), 3, 99); a.m.mem = clamp(a.m.mem + (Math.random() * 2 - 1), 10, 98); a.m.disk = clamp(a.m.disk + (Math.random() * 0.4 - 0.15), 5, 99);
      const h = (HIST[a.id] = HIST[a.id] || Array.from({ length: 24 }, () => a.m.cpu)); h.push(a.m.cpu); if (h.length > 24) h.shift();
      const open = (m) => d.alerts.some((x) => x.asset === a.id && x.state !== 'resolved' && x.msg.indexOf(m) === 0);
      if (a.m.cpu > d.thr.cpu && !open('CPU') && d.alerts.length < 80) raiseAlert(a.id, 'warning', 'CPU above ' + d.thr.cpu + '% (' + Math.round(a.m.cpu) + '%)', 'threshold');
    });
    A.save();
  };

  /* ====================================================================
     DASHBOARD
     ==================================================================== */
  V.dashboard = function () {
    const d = D(), open = d.tickets.filter(isOpen), crit = d.alerts.filter((a) => a.state === 'open' && a.sev === 'critical' && !a.suppressed);
    const risk = d.tickets.filter(slaRisk), mon = d.tickets.length ? Math.round(100 * (1 - d.tickets.filter((t) => { const s = sla(t); return s.res.state === 'breached' || s.resp.state === 'breached'; }).length / d.tickets.length)) : 100;
    const arr = d.accounts.reduce((s, a) => s + a.arr, 0), ren = d.contracts.filter((c) => c.status === 'Active' && daysTo(c.end) <= 90);
    const res = d.tickets.filter((t) => t.resolvedAt), mttr = res.length ? res.reduce((s, t) => s + (t.resolvedAt - t.created), 0) / res.length : 0;
    const pc = ['P1', 'P2', 'P3', 'P4'].map((p, i) => ({ l: PRI[p], v: open.filter((t) => t.pri === p).length, c: ['var(--crit)', 'var(--warn)', 'var(--info)', 'var(--muted)'][i] }));
    const vol = d.volume.slice(); vol[vol.length - 1] = Math.max(vol[vol.length - 1], d.tickets.filter((t) => Date.now() - t.created < 86400000).length);
    return head('Operations dashboard', 'One view across service, infrastructure and customers', `<button class="btn primary" data-a="newTicket" ${A.dis('ticket')}>${ic('plus', 16)}New ticket</button>`) +
      `<div class="grid g6" style="margin-bottom:14px">${kpi('ticket', open.length, 'Open tickets')}${kpi('clock', mon + '%', 'SLA compliance', mon < 90 ? 'warn' : 'ok')}${kpi('alert', crit.length, 'Critical alerts', crit.length ? 'crit' : 'ok')}${kpi('dollar', money(arr), 'Annual recurring revenue')}${kpi('file', ren.length, 'Renewals in 90 days', ren.length ? 'warn' : 'ok')}${kpi('activity', fmtDur(mttr), 'Mean time to resolve')}</div>` +
      `<div class="grid g2" style="margin-bottom:14px"><div class="card"><h3>${ic('chart', 16)}Ticket volume</h3>${lineSvg(vol, 'var(--brand)')}</div>
       <div class="card"><h3>${ic('ticket', 16)}Open tickets by priority</h3><div class="row wrap" style="gap:24px">${donut(pc)}${legend(pc)}</div></div></div>` +
      `<div class="grid g2" style="margin-bottom:14px"><div class="card"><h3>${ic('radar', 16)}Active alerts<span class="sp"></span><a class="btn sm" data-a="nav" data-id="noc" role="link" tabindex="0">Open NOC</a></h3>
       <div class="list">${d.alerts.filter((a) => a.state === 'open' && a.sev !== 'info').slice(0, 6).map((a) => `<div><span>${sevChip(a.sev)}</span><div class="grow"><b>${e(A.asset(a.asset).name)}</b><span class="muted small">${e(a.msg)}</span></div><span class="muted small">${ago(a.at)}</span></div>`).join('') || '<div class="muted">All clear</div>'}</div></div>
       <div class="card"><h3>${ic('clock', 16)}Tickets at SLA risk</h3><div class="list">${risk.slice(0, 6).map((t) => `<div class="click" data-a="openTicket" data-id="${t.id}" style="cursor:pointer" role="link" tabindex="0"><span class="chip ${t.pri}">${t.pri}</span><div class="grow"><b>#${t.id} ${e(t.subject)}</b><span class="muted small">${e(A.acct(t.account).name)}</span></div>${slaChip(t)}</div>`).join('') || '<div class="muted">No tickets at risk</div>'}</div></div></div>` +
      `<div class="grid g3"><div class="card"><h3>${ic('building', 16)}Accounts needing attention</h3><div class="list">${[...d.accounts].sort((a, b) => a.health - b.health).slice(0, 4).map((a) => `<div data-a="openAccount" data-id="${a.id}" style="cursor:pointer" role="link" tabindex="0"><div class="avatar">${initials(a.name)}</div><div class="grow"><b>${e(a.name)}</b><span class="muted small">${e(a.tier)} - ${money(a.arr)}</span></div>${chip(a.health, healthCls(a.health))}</div>`).join('')}</div></div>
       <div class="card"><h3>${ic('file', 16)}Upcoming renewals</h3><div class="list">${[...d.contracts].filter((c) => c.status === 'Active').sort((a, b) => a.end.localeCompare(b.end)).slice(0, 4).map((c) => `<div><div class="grow"><b>${e(A.acct(c.account).name)}</b><span class="muted small">${e(c.name)}</span></div>${chip(daysTo(c.end) + ' d', daysTo(c.end) <= 30 ? 'crit' : daysTo(c.end) <= 90 ? 'warn' : 'ok')}</div>`).join('')}</div></div>
       <div class="card"><h3>${ic('shield', 16)}Recent activity</h3><div class="list">${d.audit.slice(0, 5).map((x) => `<div><div class="grow"><b>${e(x.what)}</b><span class="muted small">${e(x.who)} - ${e(x.target)}</span></div><span class="muted small">${ago(x.at)}</span></div>`).join('')}</div></div></div>`;
  };
  ACT.openTicket = (t) => A.openDrawer('ticket', t.dataset.id);
  ACT.openAccount = (t) => { A.openDrawer('account', t.dataset.id); };
  ACT.openAsset = (t) => A.openDrawer('asset', t.dataset.id);

  /* ====================================================================
     NOC & ALERTS
     ==================================================================== */
  V.noc = function () {
    const d = D(), fs = fv('n', 's', 'open'), fv2 = fv('n', 'v', ''), fsite = fv('n', 'site', '');
    let rows = d.alerts.filter((a) => (fs === 'all' || a.state === fs) && (!fv2 || a.sev === fv2) && (!fsite || A.asset(a.asset).site === fsite));
    const cnt = (s) => d.alerts.filter((a) => a.state === 'open' && a.sev === s && !a.suppressed).length;
    return head('NOC & alerts', 'Live alert stream with correlation, suppression and one-click ticketing',
      `<button class="btn" data-a="simAlert" data-sev="warning" ${A.dis('alert')}>${ic('play', 14)}Simulate warning</button><button class="btn danger" data-a="simAlert" data-sev="critical" ${A.dis('alert')}>${ic('zap', 14)}Simulate critical</button>`) +
      `<div class="grid g4" style="margin-bottom:14px">${kpi('alert', cnt('critical'), 'Critical', cnt('critical') ? 'crit' : 'ok')}${kpi('alert', cnt('warning'), 'Warnings', cnt('warning') ? 'warn' : 'ok')}${kpi('check', d.alerts.filter((a) => a.state === 'ack').length, 'Acknowledged')}${kpi('wifi', d.sites.filter((s) => s.collector === 'online').length + '/' + d.sites.length, 'Collectors online', d.sites.some((s) => s.collector === 'offline') ? 'crit' : 'ok')}</div>` +
      `<div class="grid g4" style="margin-bottom:14px">${d.sites.map((s) => { const n = d.alerts.filter((a) => a.state === 'open' && !a.suppressed && A.asset(a.asset).site === s.id && a.sev !== 'info').length; return `<div class="card"><div class="row"><b>${e(s.name)}</b><span class="sp"></span>${chip(s.collector, s.collector === 'online' ? 'ok' : 'crit')}</div><div class="muted small">${ic('mapPin', 12)} ${e(s.region)}${s.maintenance ? ' - maintenance' : ''}</div><div class="row" style="margin-top:8px"><span>${n} open alert${n === 1 ? '' : 's'}</span><span class="sp"></span><span class="muted small">queue ${s.queue}</span></div></div>`; }).join('')}</div>` +
      `<div class="toolbar"><select id="n-s" data-filter="n.s" aria-label="State">${opts([['open', 'Open'], ['ack', 'Acknowledged'], ['resolved', 'Resolved'], ['all', 'All states']], fs)}</select>
        <select id="n-v" data-filter="n.v" aria-label="Severity">${opts([['', 'All severities'], 'critical', 'warning', 'info'], fv2)}</select>
        <select id="n-site" data-filter="n.site" aria-label="Site">${opts([['', 'All sites']].concat(d.sites.map((s) => [s.id, s.name])), fsite)}</select></div>` +
      tbl([['Severity'], ['Asset'], ['Message'], ['Site'], ['Source'], ['Age'], ['Ticket'], ['Actions']], rows.map((a) => {
        const as = A.asset(a.asset);
        return `<tr><td>${sevChip(a.sev)}${a.suppressed ? ' ' + chip(a.suppressed, '') : ''}</td><td>${assetLink(a.asset)}</td><td>${e(a.msg)}${a.count > 1 ? ` <span class="muted small">x${a.count}</span>` : ''}</td><td>${e(A.site(as.site).name)}</td><td>${e(a.source)}</td><td>${ago(a.at)}</td>
        <td>${a.ticket ? `<a data-a="openTicket" data-id="${a.ticket}" style="color:var(--brand);cursor:pointer" role="link" tabindex="0">#${a.ticket}</a>` : '-'}</td>
        <td><div class="row">${a.state === 'open' ? `<button class="btn sm" data-a="ackAlert" data-id="${a.id}" ${A.dis('alert')}>Ack</button>` : ''}${a.state !== 'resolved' ? `<button class="btn sm" data-a="resolveAlert" data-id="${a.id}" ${A.dis('alert')}>Resolve</button>` : ''}${!a.ticket && a.sev !== 'info' && a.state !== 'resolved' ? `<button class="btn sm primary" data-a="alertTicket" data-id="${a.id}" ${A.dis('alert')}>Ticket</button>` : ''}</div></td></tr>`;
      }));
  };
  ACT.simAlert = (t) => {
    if (!A.guard('alert')) return;
    const d = D(), pool = d.assets.filter((a) => a.status === 'In service');
    const asset = pool[Math.floor(Math.random() * pool.length)];
    const msgs = t.dataset.sev === 'critical' ? ['Interface down', 'Service unreachable', 'Heartbeat missed x3', 'Power supply failure'] : ['Latency above baseline', 'Memory above 90%', 'Packet loss 3%'];
    const r = raiseAlert(asset.id, t.dataset.sev, msgs[Math.floor(Math.random() * msgs.length)], 'threshold');
    A.commit('Simulated ' + t.dataset.sev + ' alert', asset.name); A.toast(r.note, 'radar');
  };
  const alertById = (id) => D().alerts.find((a) => a.id === Number(id));
  ACT.ackAlert = (t) => { if (!A.guard('alert')) return; alertById(t.dataset.id).state = 'ack'; A.commit('Acknowledged alert', '#' + t.dataset.id); };
  ACT.resolveAlert = (t) => { if (!A.guard('alert')) return; alertById(t.dataset.id).state = 'resolved'; A.commit('Resolved alert', '#' + t.dataset.id); };
  ACT.alertTicket = (t) => {
    if (!A.guard('alert')) return; const al = alertById(t.dataset.id), as = A.asset(al.asset);
    const tk = createTicket({ subject: as.name + ': ' + al.msg, account: as.account, pri: al.sev === 'critical' ? 'P1' : 'P3', cat: as.type === 'Database' ? 'Database' : 'Network', asset: as.id, source: 'Alert', by: 'System', desc: 'Raised by ' + A.ROLES[ui.role].user + ' from alert #' + al.id + '.' });
    al.ticket = tk.id; A.commit('Created ticket from alert', '#' + tk.id); A.toast('Ticket #' + tk.id + ' created');
  };

  /* ====================================================================
     MONITORING
     ==================================================================== */
  V.monitoring = function () {
    const d = D(); d.thr = d.thr || { cpu: 85, mem: 90, disk: 90 };
    const meter = (v, thr) => `<div style="min-width:90px">${barc(v, v >= thr ? 'crit' : v >= thr - 10 ? 'warn' : 'ok')}<span class="small ${v >= thr ? '' : 'muted'}">${Math.round(v)}%</span></div>`;
    return head('Monitoring', 'Edge collectors poll locally, aggregate, and forward with store-and-forward queues', `<button class="btn" data-a="editThr" ${A.dis('monitor')}>${ic('settings', 14)}Thresholds</button>`) +
      `<div class="grid g2" style="margin-bottom:14px">${d.sites.map((s) => `<div class="card"><div class="row"><b style="font-size:15px">${e(s.name)}</b>${chip(s.collector, s.collector === 'online' ? 'ok' : 'crit')}${s.maintenance ? chip('maintenance', 'warn') : ''}<span class="sp"></span>${spark(HIST['s' + s.id], s.collector === 'online' ? 'var(--brand)' : 'var(--crit)')}</div>
        <div class="muted small" style="margin:4px 0 10px">${ic('mapPin', 12)} ${e(s.region)} - ${d.assets.filter((a) => a.site === s.id).length} monitored assets</div>
        <div class="grid" style="grid-template-columns:repeat(3,1fr);gap:8px"><div><b>${s.collector === 'online' ? Math.round(s.latency) + ' ms' : '-'}</b><div class="muted small">Link latency</div></div><div><b>${s.queue}</b><div class="muted small">Queued batches</div></div><div><b>${s.collector === 'online' ? 'Live' : 'Buffering'}</b><div class="muted small">Forwarding</div></div></div>
        <div class="row" style="margin-top:12px"><button class="btn sm" data-a="toggleCollector" data-id="${s.id}" ${A.dis('monitor')}>${ic(s.collector === 'online' ? 'pause' : 'play', 12)}${s.collector === 'online' ? 'Simulate link outage' : 'Restore link'}</button><button class="btn sm" data-a="toggleMaint" data-id="${s.id}" ${A.dis('monitor')}>${ic('wrench', 12)}${s.maintenance ? 'End maintenance' : 'Start maintenance'}</button></div></div>`).join('')}</div>` +
      tbl([['Asset'], ['Site'], ['CPU (' + d.thr.cpu + '%)'], ['Memory (' + d.thr.mem + '%)'], ['Disk (' + d.thr.disk + '%)'], ['Trend'], ['State']], d.assets.filter((a) => a.status !== 'Retired').map((a) => `<tr class="click" data-a="openAsset" data-id="${a.id}"><td><b>${e(a.name)}</b><div class="muted small">${e(a.type)}</div></td><td>${e(A.site(a.site).name)}</td><td>${meter(a.m.cpu, d.thr.cpu)}</td><td>${meter(a.m.mem, d.thr.mem)}</td><td>${meter(a.m.disk, d.thr.disk)}</td><td>${spark(HIST[a.id])}</td><td>${chip({ ok: 'Healthy', warn: 'Warning', crit: 'Critical' }[assetState(a)], assetState(a))}</td></tr>`));
  };
  ACT.toggleCollector = (t) => { if (!A.guard('monitor')) return; const s = A.site(t.dataset.id); s.collector = s.collector === 'online' ? 'offline' : 'online'; A.commit('Collector ' + s.collector, s.name); A.toast(s.name + ' collector ' + s.collector + (s.collector === 'offline' ? ' - queueing locally' : ' - replaying queue'), 'wifi'); };
  ACT.toggleMaint = (t) => { if (!A.guard('monitor')) return; const s = A.site(t.dataset.id); s.maintenance = !s.maintenance; A.commit((s.maintenance ? 'Started' : 'Ended') + ' maintenance window', s.name); };
  ACT.editThr = () => { if (A.guard('monitor')) A.openModal('thr'); };
  MO.thr = () => ({ title: 'Alert thresholds', html: `<form data-form="thr">${field('CPU warning (%)', `<input name="cpu" type="number" min="10" max="100" value="${D().thr.cpu}">`)}${field('Memory warning (%)', `<input name="mem" type="number" min="10" max="100" value="${D().thr.mem}">`)}${field('Disk warning (%)', `<input name="disk" type="number" min="10" max="100" value="${D().thr.disk}">`)}<div class="acts"><button type="button" class="btn" data-a="closeModal">Cancel</button><button class="btn primary">Save</button></div></form>` });
  FORMS.thr = (v) => { D().thr = { cpu: Number(v.cpu), mem: Number(v.mem), disk: Number(v.disk) }; A.closeModal(); A.commit('Updated alert thresholds'); A.toast('Thresholds saved'); };

  /* ====================================================================
     TOPOLOGY
     ==================================================================== */
  V.topology = function () {
    const d = D(), sel = ui.arg && A.asset(ui.arg) ? A.asset(ui.arg) : (ui.topoSel && A.asset(ui.topoSel)) || null;
    const depth = {}; const dep = (a) => (depth[a.id] != null ? depth[a.id] : (depth[a.id] = a.dep.length ? 1 + Math.max.apply(null, a.dep.map((id) => dep(A.asset(id)))) : 0));
    d.assets.forEach(dep);
    const W = 1400, colW = W / d.sites.length, pos = {};
    d.sites.forEach((s, si) => { const byD = {}; d.assets.filter((a) => a.site === s.id).forEach((a) => (byD[depth[a.id]] = byD[depth[a.id]] || []).push(a)); Object.keys(byD).forEach((k) => byD[k].forEach((a, i) => { const n = byD[k].length; pos[a.id] = { x: si * colW + (colW * (i + 1)) / (n + 1), y: 60 + k * 100 }; })); });
    const imp = sel ? new Set(downstream(sel.id).map((a) => a.id)) : new Set();
    const maxD = Math.max.apply(null, Object.values(depth)), H = 100 + maxD * 100 + 40;
    const edges = d.assets.map((a) => a.dep.map((id) => { const p = pos[a.id], q = pos[id]; const hot = sel && (id === sel.id || imp.has(id)) && (imp.has(a.id)); return `<path class="edge ${hot ? 'hot' : ''}" d="M${q.x},${q.y + 18} C${q.x},${(q.y + p.y) / 2} ${p.x},${(q.y + p.y) / 2} ${p.x},${p.y - 18}"/>`; }).join('')).join('');
    const nodes = d.assets.map((a) => { const p = pos[a.id], st = assetState(a); return `<g class="node ${st} ${sel && sel.id === a.id ? 'sel' : ''} ${imp.has(a.id) ? 'imp' : ''}" data-a="topoSel" data-id="${a.id}" transform="translate(${p.x - 54},${p.y - 20})" tabindex="0" role="button" aria-label="${e(a.name)} ${st}"><rect width="108" height="40" rx="8"/><text x="54" y="17" text-anchor="middle" font-weight="600">${e(a.name)}</text><text class="sub" x="54" y="31" text-anchor="middle">${e(a.type)}</text></g>`; }).join('');
    const heads = d.sites.map((s, si) => `<text x="${si * colW + colW / 2}" y="22" text-anchor="middle" font-weight="700">${e(s.name)}</text>`).join('');
    const sidePanel = sel ? `<div class="card"><h3>${ic('server', 16)}${e(sel.name)}<span class="sp"></span>${chip({ ok: 'Healthy', warn: 'Warning', crit: 'Critical' }[assetState(sel)], assetState(sel))}</h3>${dl([['Type', e(sel.type)], ['Customer', e(A.acct(sel.account).name)], ['Depends on', sel.dep.map((id) => e(A.asset(id).name)).join(', ') || 'Nothing (root)']])}<b>Impact if this fails (${imp.size})</b><div class="list">${[...imp].map((id) => { const a = A.asset(id); return `<div><div class="grow"><b>${e(a.name)}</b><span class="muted small">${e(A.acct(a.account).name)}</span></div>${chip(a.crit === 3 ? 'critical' : a.crit === 2 ? 'important' : 'minor', a.crit === 3 ? 'crit' : '')}</div>`; }).join('') || '<div class="muted">No dependants</div>'}</div><div class="row" style="margin-top:10px"><button class="btn sm" data-a="openAsset" data-id="${sel.id}">Open CI</button></div></div>` : `<div class="card"><h3>${ic('share', 16)}Impact analysis</h3><p class="muted">Select any node to see its dependencies and everything that would be affected if it failed. Dashed red borders mark downstream assets.</p></div>`;
    return head('Topology', 'Dependency map across the main and edge data centres') + `<div class="legend"><span><i style="background:var(--ok)"></i>Healthy</span><span><i style="background:var(--warn)"></i>Warning / maintenance</span><span><i style="background:var(--crit)"></i>Critical alert</span><span><i style="border:2px dashed var(--crit)"></i>Impacted by selection</span></div>
      <div class="grid" style="grid-template-columns:minmax(0,1fr) minmax(260px,320px);align-items:start"><div style="overflow:auto"><svg class="topo" viewBox="0 0 ${W} ${H}" style="min-width:900px" role="img" aria-label="Infrastructure dependency graph">${heads}${edges}${nodes}</svg></div>${sidePanel}</div>`;
  };
  ACT.topoSel = (t) => { ui.topoSel = t.dataset.id; if (ui.arg) location.hash = '#/topology'; else A.render(); };

  /* ====================================================================
     HELP DESK
     ==================================================================== */
  V.tickets = function () {
    const d = D(), q = fv('t', 'q').toLowerCase(), pf = fv('t', 'p'), af = fv('t', 'a'), tab = curTab('tq', 'open'), me = A.ROLES[ui.role].user;
    let rows = d.tickets.filter((t) => {
      if (tab === 'open' && !isOpen(t)) return false; if (tab === 'unassigned' && (t.assignee || !isOpen(t))) return false; if (tab === 'risk' && !slaRisk(t)) return false; if (tab === 'mine' && t.assignee !== me) return false; if (tab === 'closed' && isOpen(t)) return false;
      if (pf && t.pri !== pf) return false; if (af && t.account !== af) return false;
      return !q || ('#' + t.id + ' ' + t.subject + ' ' + A.acct(t.account).name).toLowerCase().includes(q);
    });
    const cnt = (fn) => d.tickets.filter(fn).length;
    return head('Help desk', 'Tickets with SLA clocks that pause, warn and escalate', `<button class="btn" data-a="exportTickets">${ic('download', 14)}Export CSV</button><button class="btn primary" data-a="newTicket" ${A.dis('ticket')}>${ic('plus', 14)}New ticket</button>`) +
      tabs('tq', [['open', `Open (${cnt(isOpen)})`], ['mine', 'My queue'], ['unassigned', `Unassigned (${cnt((t) => !t.assignee && isOpen(t))})`], ['risk', `At risk (${cnt(slaRisk)})`], ['closed', 'Resolved'], ['all', 'All']], 'open') +
      `<div class="toolbar"><input id="t-q" data-filter="t.q" type="search" placeholder="Search tickets" value="${e(fv('t', 'q'))}" aria-label="Search tickets" style="min-width:220px"><select id="t-p" data-filter="t.p" aria-label="Priority">${opts([['', 'All priorities'], ['P1', 'P1 Critical'], ['P2', 'P2 High'], ['P3', 'P3 Medium'], ['P4', 'P4 Low']], pf)}</select><select id="t-a" data-filter="t.a" aria-label="Customer">${opts([['', 'All customers']].concat(d.accounts.map((a) => [a.id, a.name])), af)}</select><span class="sp"></span><span class="muted small">${rows.length} ticket${rows.length === 1 ? '' : 's'}</span></div>` +
      tbl([['#'], ['Subject'], ['Customer'], ['Priority'], ['Status'], ['Assignee'], ['SLA'], ['Age']], rows.map((t) => `<tr class="click" data-a="openTicket" data-id="${t.id}" tabindex="0" role="link"><td>${t.id}</td><td><b>${e(t.subject)}</b><div class="muted small">${e(t.cat)} via ${e(t.source)}</div></td><td>${e(A.acct(t.account).name)}</td><td>${chip(t.pri, t.pri)}</td><td>${chip(t.status, statusCls(t.status))}</td><td>${t.assignee ? e(t.assignee) : '<span class="muted">Unassigned</span>'}</td><td>${slaChip(t)}</td><td class="muted">${fmtDur(Date.now() - t.created)}</td></tr>`));
  };
  ACT.exportTickets = () => download('tickets.csv', csv([['id', 'subject', 'customer', 'priority', 'status', 'assignee', 'category', 'created']].concat(D().tickets.map((t) => [t.id, t.subject, A.acct(t.account).name, t.pri, t.status, t.assignee || '', t.cat, new Date(t.created).toISOString()]))));
  ACT.newTicket = () => { if (A.guard('ticket')) A.openModal('newTicket'); };
  MO.newTicket = (m) => ({ title: 'New ticket', html: `<form data-form="newTicket">${field('Subject', '<input name="subject" required maxlength="140">')}<div class="grid" style="grid-template-columns:1fr 1fr;gap:10px">${field('Customer', `<select name="account" id="nt-acct" data-onchange="ntAcct">${opts(D().accounts.map((a) => [a.id, a.name]), m.account || D().accounts[0].id)}</select>`)}${field('Priority', `<select name="pri">${opts([['P1', 'P1 Critical'], ['P2', 'P2 High'], ['P3', 'P3 Medium'], ['P4', 'P4 Low']], 'P3')}</select>`)}</div><div class="grid" style="grid-template-columns:1fr 1fr;gap:10px">${field('Category', `<select name="cat">${opts(['Network', 'Server', 'Database', 'Application', 'Access', 'Billing'], 'Network')}</select>`)}${field('Affected asset', `<select name="asset" id="nt-asset"><option value="">None</option>${opts(D().assets.filter((a) => a.account === (m.account || D().accounts[0].id)).map((a) => [a.id, a.name]))}</select>`)}</div>${field('Description', '<textarea name="desc" maxlength="2000"></textarea>')}<div class="acts"><button type="button" class="btn" data-a="closeModal">Cancel</button><button class="btn primary">Create ticket</button></div></form>` });
  ACT.ntAcct = (t) => { const sel = document.getElementById('nt-asset'); sel.innerHTML = '<option value="">None</option>' + opts(D().assets.filter((a) => a.account === t.value).map((a) => [a.id, a.name])); };
  FORMS.newTicket = (v) => {
    const t = createTicket({ subject: v.subject.trim(), account: v.account, pri: v.pri, cat: v.cat, asset: v.asset || null, source: 'Phone', by: A.ROLES[ui.role].user, desc: v.desc.trim() });
    A.closeModal(); A.commit('Created ticket', '#' + t.id); A.toast('Ticket #' + t.id + ' created' + (t.pri !== v.pri ? ' (priority raised by R19)' : ''));
  };

  DR.ticket = function (id) {
    const t = A.ticket(id); if (!t) return null; const s = sla(t), acc = A.acct(t.account), canW = A.can('ticket');
    const flows = { Open: [['In progress', 'Start work', 'play']], 'In progress': [['Pending', 'Waiting on customer', 'pause'], ['Resolved', 'Resolve', 'check']], Pending: [['In progress', 'Resume', 'play'], ['Resolved', 'Resolve', 'check']], Resolved: [['Closed', 'Close', 'lock'], ['Open', 'Reopen', 'refresh']], Closed: [['Open', 'Reopen', 'refresh']] };
    const slaRow = (label, st, target, usedMs) => `<div style="margin-bottom:10px"><div class="row small"><b>${label}</b><span class="sp"></span>${chip(st.state === 'running' ? fmtDur(st.left) + ' left' : st.state === 'paused' ? 'Paused' : st.state === 'met' ? 'Met' : 'Breached ' + fmtDur(-st.left), st.state === 'breached' ? 'crit' : st.state === 'met' ? 'ok' : st.state === 'paused' ? '' : 'info')}</div>${barc((usedMs / target) * 100, st.state === 'breached' ? 'crit' : usedMs / target > 0.75 ? 'warn' : 'ok')}<div class="muted small">Target ${fmtDur(target)} (${e(acc.tier)} contract)</div></div>`;
    const respEl = (t.firstResponse || Date.now()) - t.created;
    return {
      title: `#${t.id} ${e(t.subject)}`,
      html: `<div class="pill-row" style="margin-bottom:12px">${chip(t.pri, t.pri)}${chip(t.status, statusCls(t.status))}${slaChip(t)}</div>
      ${dl([['Customer', acctLink(t.account)], ['Asset', t.asset ? assetLink(t.asset) : '-'], ['Category', e(t.cat)], ['Source', e(t.source)], ['Created', ago(t.created)], ['Assignee', canW ? `<select data-onchange="assignTicket" data-id="${t.id}" aria-label="Assignee"><option value="">Unassigned</option>${opts(agents(), t.assignee)}</select>` : e(t.assignee || 'Unassigned')]])}
      <div class="card" style="margin-bottom:14px;box-shadow:none">${slaRow('First response', s.resp, s.respT, respEl)}${slaRow('Resolution', s.res, s.resT, Math.max(0, s.elapsed))}</div>
      <div class="row wrap" style="margin-bottom:14px">${(flows[t.status] || []).map((f) => `<button class="btn ${f[0] === 'Resolved' || f[0] === 'In progress' ? 'primary' : ''}" data-a="ticketStatus" data-id="${t.id}" data-s="${f[0]}" ${canW ? '' : 'disabled title="Your role cannot do this"'}>${ic(f[2], 14)}${f[1]}</button>`).join('')}</div>
      ${t.csat ? `<div class="card" style="margin-bottom:14px;box-shadow:none"><b>Customer satisfaction</b><div>${Array.from({ length: 5 }, (_, i) => `<span style="color:${i < t.csat ? 'var(--warn)' : 'var(--line)'}">${ic('star', 18)}</span>`).join('')} <span class="muted">${t.csat}/5</span></div></div>` : ''}
      <h4 style="margin:0 0 8px">Conversation</h4>${t.comments.map((c) => `<div class="comment ${c.internal ? 'internal' : ''}"><div class="row small"><b>${e(c.by)}</b>${c.internal ? chip('internal', 'warn') : ''}<span class="sp"></span><span class="muted">${ago(c.at)}</span></div><div>${e(c.text)}</div></div>`).join('') || '<div class="muted">No messages yet</div>'}
      ${canW ? `<form data-form="comment" data-id="${t.id}" style="margin-top:10px"><textarea name="text" required placeholder="Write a reply or internal note" aria-label="Reply"></textarea><div class="row" style="margin-top:8px"><label class="row small"><input type="checkbox" name="internal" value="1"> Internal note</label><span class="sp"></span><button class="btn primary">Send</button></div></form>` : ''}`,
    };
  };
  ACT.assignTicket = (t) => { if (!A.guard('ticket')) return; const tk = A.ticket(t.dataset.id); tk.assignee = t.value || null; A.commit('Assigned ticket', '#' + tk.id + ' to ' + (t.value || 'nobody')); };
  ACT.ticketStatus = (t) => { if (!A.guard('ticket')) return; const tk = A.ticket(t.dataset.id); setStatus(tk, t.dataset.s); if (t.dataset.s === 'Resolved') A.toast('Resolved. CSAT survey sent (R11)', 'mail'); A.commit('Ticket ' + t.dataset.s, '#' + tk.id); };
  FORMS.comment = (v, f) => {
    if (!A.guard('ticket')) return; const tk = A.ticket(f.dataset.id); const internal = !!v.internal;
    tk.comments.push({ by: A.ROLES[ui.role].user, at: Date.now(), text: v.text.trim(), internal });
    if (!internal && !tk.firstResponse) tk.firstResponse = Date.now();
    if (!internal && tk.status === 'Pending') setStatus(tk, 'In progress');
    A.commit(internal ? 'Internal note added' : 'Replied to ticket', '#' + tk.id);
  };

  /* ====================================================================
     KNOWLEDGE BASE
     ==================================================================== */
  V.kb = function () {
    const d = D(), q = fv('k', 'q').toLowerCase(), c = fv('k', 'c'), cats = [...new Set(d.kb.map((k) => k.cat))];
    const rows = d.kb.filter((k) => (!c || k.cat === c) && (!q || (k.title + ' ' + k.body).toLowerCase().includes(q)));
    return head('Knowledge base', 'Runbooks and answers shared by agents, engineers and the customer portal') +
      `<div class="toolbar"><input id="k-q" data-filter="k.q" type="search" placeholder="Search articles" value="${e(fv('k', 'q'))}" aria-label="Search articles" style="min-width:260px"><select id="k-c" data-filter="k.c" aria-label="Category">${opts([['', 'All categories']].concat(cats), c)}</select></div>` +
      `<div class="grid g3">${rows.map((k) => `<div class="card" style="cursor:pointer" data-a="openKb" data-id="${k.id}" tabindex="0" role="link"><div class="row">${chip(k.cat, 'info')}<span class="sp"></span><span class="muted small">${ic('eye', 12)} ${k.views}</span></div><h3 style="margin:10px 0 6px">${e(k.title)}</h3><div class="muted small" style="display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden">${e(k.body)}</div><div class="small" style="margin-top:8px;color:var(--ok)">${k.helpful}% found this helpful</div></div>`).join('') || empty('No articles match')}</div>`;
  };
  ACT.openKb = (t) => A.openDrawer('kb', t.dataset.id);
  DR.kb = (id) => { const k = D().kb.find((x) => x.id === id); return k ? { title: e(k.title), html: `<div class="pill-row" style="margin-bottom:12px">${chip(k.cat, 'info')}${chip(k.views + ' views', '')}${chip(k.helpful + '% helpful', 'ok')}</div><div style="white-space:pre-wrap;line-height:1.7">${e(k.body)}</div><div class="row" style="margin-top:18px"><span class="muted">Was this helpful?</span><button class="btn sm" data-a="kbVote" data-id="${k.id}" data-v="1">${ic('check', 12)}Yes</button><button class="btn sm" data-a="kbVote" data-id="${k.id}" data-v="0">${ic('x', 12)}No</button></div>` } : null; };
  ACT.kbVote = (t) => { const k = D().kb.find((x) => x.id === t.dataset.id); k.helpful = Math.max(0, Math.min(100, k.helpful + (t.dataset.v === '1' ? 1 : -1))); A.save(); A.toast('Thanks for the feedback'); A.render(); };

  /* ====================================================================
     CUSTOMER PORTAL
     ==================================================================== */
  V.portal = function () {
    const d = D(), me = d.accounts[0], tab = curTab('portal', 'tickets'), mine = d.tickets.filter((t) => t.account === me.id);
    const preview = ui.role !== 'customer' ? `<div class="card" style="margin-bottom:14px;background:var(--info-soft);box-shadow:none">${ic('eye', 16)} Preview of the customer portal as <b>${e(me.name)}</b>. Customers never see contract values, alerts or internal notes. Use <b>View as: Customer</b> to experience it fully.</div>` : '';
    let body = '';
    if (tab === 'tickets') body = mine.length ? `<div class="grid">${mine.map((t) => `<div class="card"><div class="row"><b>#${t.id} ${e(t.subject)}</b><span class="sp"></span>${chip(t.status, statusCls(t.status))}</div><div class="muted small">Opened ${ago(t.created)} - priority ${t.pri}</div>${t.comments.filter((c) => !c.internal).slice(-2).map((c) => `<div class="comment" style="margin-top:8px"><b>${e(c.by)}</b> <span class="muted small">${ago(c.at)}</span><div>${e(c.text)}</div></div>`).join('')}${t.status === 'Resolved' && !t.csat ? `<div class="row" style="margin-top:10px"><span>How did we do?</span>${[1, 2, 3, 4, 5].map((n) => `<button class="btn sm" data-a="portalCsat" data-id="${t.id}" data-n="${n}" aria-label="${n} star${n > 1 ? 's' : ''}">${n}${ic('star', 12)}</button>`).join('')}</div>` : t.csat ? `<div class="muted small" style="margin-top:8px">Your rating: ${t.csat}/5</div>` : ''}</div>`).join('')}</div>` : empty('No requests yet');
    else if (tab === 'new') body = `<div class="card" style="max-width:640px"><form data-form="portalTicket">${field('What do you need help with?', '<input name="subject" required maxlength="140">')}${field('Category', `<select name="cat">${opts(['Network', 'Server', 'Database', 'Application', 'Access', 'Billing'])}</select>`)}${field('Details', '<textarea name="desc" maxlength="2000"></textarea>')}<button class="btn primary">Submit request</button></form></div>`;
    else body = `<div class="grid g3">${d.kb.slice(0, 6).map((k) => `<div class="card" style="cursor:pointer" data-a="openKb" data-id="${k.id}" tabindex="0" role="link"><b>${e(k.title)}</b><div class="muted small">${e(k.cat)}</div></div>`).join('')}</div>`;
    return preview + `<div class="hero"><h1>Welcome, ${e(me.name)}</h1><p>Track requests, ask for help and find answers.</p></div>` + tabs('portal', [['tickets', `My requests (${mine.length})`], ['new', 'New request'], ['help', 'Help articles']], 'tickets') + body;
  };
  FORMS.portalTicket = (v) => { const me = D().accounts[0]; const t = createTicket({ subject: v.subject.trim(), account: me.id, pri: 'P3', cat: v.cat, source: 'Portal', by: 'Wendy Albrecht', desc: v.desc.trim() }); ui.tab.portal = 'tickets'; A.commit('Portal request created', '#' + t.id); A.toast('Request #' + t.id + ' received. We will respond within ' + fmtDur(sla(t).respT)); };
  ACT.portalCsat = (t) => { const tk = A.ticket(t.dataset.id), n = Number(t.dataset.n); tk.csat = n; const r12 = D().rules.find((r) => r.id === 'R12'); if (n <= 2 && r12.enabled) { const a = A.acct(tk.account); a.health = Math.max(0, a.health - 3); r12.hits++; A.toast('Thanks - your account manager has been notified', 'mail'); } else A.toast('Thank you for your feedback'); A.commit('CSAT submitted', '#' + tk.id); };

  /* ====================================================================
     ACCOUNTS (CRM)
     ==================================================================== */
  V.accounts = function () {
    const d = D(), q = fv('c', 'q').toLowerCase(), tf = fv('c', 't');
    const rows = d.accounts.filter((a) => (!tf || a.tier === tf) && (!q || (a.name + ' ' + a.industry + ' ' + a.owner).toLowerCase().includes(q)));
    return head('Accounts', 'Customer 360: contracts, assets, tickets and revenue in one place', `<button class="btn primary" data-a="newAccount" ${A.dis('crm')}>${ic('plus', 14)}New account</button>`) +
      `<div class="toolbar"><input id="c-q" data-filter="c.q" type="search" placeholder="Search accounts" value="${e(fv('c', 'q'))}" aria-label="Search accounts" style="min-width:240px"><select id="c-t" data-filter="c.t" aria-label="Tier">${opts([['', 'All tiers'], 'Gold', 'Silver', 'Bronze'], tf)}</select></div>` +
      tbl([['Account'], ['Industry'], ['Tier'], ['Owner'], ['Health'], ['ARR', 'num'], ['Open tickets', 'num'], ['Assets', 'num']], rows.map((a) => `<tr class="click" data-a="openAccount" data-id="${a.id}" tabindex="0" role="link"><td><div class="row"><div class="avatar">${initials(a.name)}</div><b>${e(a.name)}</b></div></td><td>${e(a.industry)}</td><td>${chip(a.tier, a.tier === 'Gold' ? 'warn' : '')}</td><td>${e(a.owner)}</td><td style="min-width:120px">${barc(a.health, healthCls(a.health))}<span class="small muted">${a.health}</span></td><td class="num">${moneyFull(a.arr)}</td><td class="num">${d.tickets.filter((t) => t.account === a.id && isOpen(t)).length}</td><td class="num">${d.assets.filter((x) => x.account === a.id).length}</td></tr>`));
  };
  ACT.newAccount = () => { if (A.guard('crm')) A.openModal('newAccount'); };
  MO.newAccount = () => ({ title: 'New account', html: `<form data-form="newAccount">${field('Company name', '<input name="name" required maxlength="80">')}<div class="grid" style="grid-template-columns:1fr 1fr;gap:10px">${field('Industry', '<input name="industry" required maxlength="40">')}${field('Tier', `<select name="tier">${opts(['Gold', 'Silver', 'Bronze'], 'Silver')}</select>`)}</div><div class="grid" style="grid-template-columns:1fr 1fr;gap:10px">${field('Account owner', `<select name="owner">${opts(['Mia Morgan', 'Sam Ortega'])}</select>`)}${field('Expected ARR ($)', '<input name="arr" type="number" min="0" value="50000">')}</div><div class="acts"><button type="button" class="btn" data-a="closeModal">Cancel</button><button class="btn primary">Create account</button></div></form>` });
  FORMS.newAccount = (v) => { const a = { id: 'a' + A.nextId('account'), name: v.name.trim(), industry: v.industry.trim(), tier: v.tier, owner: v.owner, health: 85, arr: Number(v.arr) || 0, employees: 0, city: '' }; D().accounts.unshift(a); A.closeModal(); A.commit('Created account', a.name); A.toast('Account created'); };
  DR.account = function (id) {
    const d = D(), a = A.acct(id); if (!a) return null; const tab = curTab('drawer', 'overview');
    const tks = d.tickets.filter((t) => t.account === id), ast = d.assets.filter((x) => x.account === id), cts = d.contracts.filter((c) => c.account === id), con = d.contacts.filter((c) => c.account === id), dls = d.deals.filter((x) => x.account === id);
    const open = tks.filter(isOpen).length, crit = d.alerts.filter((al) => al.state === 'open' && !al.suppressed && al.sev === 'critical' && A.asset(al.asset).account === id).length;
    const why = ['Starts at 100', open ? `-${open * 5} for ${open} open ticket${open > 1 ? 's' : ''}` : null, crit ? `-${crit * 10} for ${crit} critical alert${crit > 1 ? 's' : ''}` : null].filter(Boolean).join(', ');
    let body = '';
    if (tab === 'overview') body = dl([['Industry', e(a.industry)], ['Tier', chip(a.tier, a.tier === 'Gold' ? 'warn' : '')], ['Owner', e(a.owner)], ['ARR', moneyFull(a.arr)], ['Location', e(a.city || '-')], ['Health', chip(a.health, healthCls(a.health)) + ` <span class="muted small">${e(why)}</span>`]]) + `<div class="grid" style="grid-template-columns:repeat(3,1fr);gap:8px"><div class="card"><b>${open}</b><div class="muted small">Open tickets</div></div><div class="card"><b>${ast.length}</b><div class="muted small">Covered assets</div></div><div class="card"><b>${crit}</b><div class="muted small">Critical alerts</div></div></div>`;
    else if (tab === 'tickets') body = `<div class="list">${tks.map((t) => `<div style="cursor:pointer" data-a="openTicket" data-id="${t.id}" role="link" tabindex="0">${chip(t.pri, t.pri)}<div class="grow"><b>#${t.id} ${e(t.subject)}</b><span class="muted small">${e(t.status)}</span></div>${slaChip(t)}</div>`).join('') || '<div class="muted">No tickets</div>'}</div>`;
    else if (tab === 'assets') body = `<div class="list">${ast.map((x) => `<div style="cursor:pointer" data-a="openAsset" data-id="${x.id}" role="link" tabindex="0">${ic('server', 16)}<div class="grow"><b>${e(x.name)}</b><span class="muted small">${e(x.type)} - ${e(x.ip)}</span></div>${chip({ ok: 'ok', warn: 'warn', crit: 'crit' }[assetState(x)], assetState(x))}</div>`).join('') || '<div class="muted">No assets</div>'}</div>`;
    else if (tab === 'contracts') body = `<div class="list">${cts.map((c) => `<div><div class="grow"><b>${e(c.name)}</b><span class="muted small">${c.start} to ${c.end}</span></div><b>${moneyFull(c.value)}</b>${chip(c.status === 'Expired' ? 'Expired' : daysTo(c.end) + ' d', c.status === 'Expired' ? 'crit' : daysTo(c.end) <= 90 ? 'warn' : 'ok')}</div>`).join('') || '<div class="muted">No contracts</div>'}</div>`;
    else if (tab === 'contacts') body = `<div class="list">${con.map((c) => `<div><div class="avatar">${initials(c.name)}</div><div class="grow"><b>${e(c.name)}${c.primary ? ' ' + chip('primary', 'info') : ''}</b><span class="muted small">${e(c.title)}</span></div><span class="muted small">${ic('mail', 12)} ${e(c.email)}</span></div>`).join('') || '<div class="muted">No contacts</div>'}</div>`;
    else body = `<div class="list">${dls.map((x) => `<div><div class="grow"><b>${e(x.name)}</b><span class="muted small">${e(x.stage)} - close ${x.close}</span></div><b>${moneyFull(x.value)}</b></div>`).join('') || '<div class="muted">No opportunities</div>'}</div>`;
    return { title: `<span style="display:flex;gap:10px;align-items:center"><span class="avatar">${initials(a.name)}</span>${e(a.name)}</span>`, html: tabs('drawer', [['overview', 'Overview'], ['tickets', `Tickets (${tks.length})`], ['assets', `Assets (${ast.length})`], ['contracts', 'Contracts'], ['contacts', 'Contacts'], ['deals', 'Deals']], 'overview') + body };
  };

  /* ====================================================================
     PIPELINE
     ==================================================================== */
  const STAGES = ['Lead', 'Qualified', 'Proposal', 'Negotiation', 'Won'], PROB = { Lead: 10, Qualified: 30, Proposal: 50, Negotiation: 70, Won: 100 };
  V.pipeline = function () {
    const d = D(), open = d.deals.filter((x) => x.stage !== 'Won'), total = open.reduce((s, x) => s + x.value, 0), weighted = open.reduce((s, x) => s + (x.value * x.prob) / 100, 0);
    return head('Pipeline', 'Drag cards between stages, or use the arrows', `<button class="btn primary" data-a="newDeal" ${A.dis('crm')}>${ic('plus', 14)}New deal</button>`) +
      `<div class="grid g4" style="margin-bottom:14px">${kpi('funnel', money(total), 'Open pipeline')}${kpi('dollar', money(weighted), 'Weighted forecast')}${kpi('check', money(d.deals.filter((x) => x.stage === 'Won').reduce((s, x) => s + x.value, 0)), 'Won this quarter', 'ok')}${kpi('star', open.length, 'Open deals')}</div>` +
      `<div class="kanban">${STAGES.map((s) => { const items = d.deals.filter((x) => x.stage === s); return `<div class="col" data-stage="${s}"><h4>${s}<span class="sp" style="flex:1"></span><span class="muted small">${items.length} - ${money(items.reduce((t, x) => t + x.value, 0))}</span></h4>${items.map((x, i) => `<div class="deal" draggable="${A.can('crm')}" data-deal="${x.id}"><b>${e(x.name)}</b><div class="muted small">${e(A.acct(x.account).name)}</div><div class="row" style="margin-top:6px"><b>${moneyFull(x.value)}</b><span class="sp"></span><span class="muted small">${x.prob}% - ${x.close}</span></div><div class="row" style="margin-top:6px"><span class="avatar" style="width:22px;height:22px;font-size:10px">${initials(x.owner)}</span><span class="sp"></span><button class="btn sm" data-a="dealMove" data-id="${x.id}" data-dir="-1" aria-label="Move back" ${A.dis('crm')}>${ic('chevron', 12).replace('<svg', '<svg style="transform:rotate(180deg)"')}</button><button class="btn sm" data-a="dealMove" data-id="${x.id}" data-dir="1" aria-label="Move forward" ${A.dis('crm')}>${ic('chevron', 12)}</button></div></div>`).join('')}</div>`; }).join('')}</div>`;
  };
  function moveDeal(id, stage) {
    if (!A.guard('crm')) return; const x = D().deals.find((y) => y.id === id); if (!x || x.stage === stage) return;
    x.stage = stage; x.prob = PROB[stage]; A.commit('Moved deal to ' + stage, x.name); if (stage === 'Won') A.toast('Deal won - ' + moneyFull(x.value), 'star');
  }
  ACT.dealMove = (t) => { const x = D().deals.find((y) => y.id === t.dataset.id), i = STAGES.indexOf(x.stage) + Number(t.dataset.dir); if (i >= 0 && i < STAGES.length) moveDeal(x.id, STAGES[i]); };
  document.addEventListener('dragstart', (ev) => { const c = ev.target.closest && ev.target.closest('[data-deal]'); if (c) { ev.dataTransfer.setData('text/plain', c.dataset.deal); ev.dataTransfer.effectAllowed = 'move'; } });
  document.addEventListener('dragover', (ev) => { const c = ev.target.closest && ev.target.closest('.col'); if (c) { ev.preventDefault(); c.classList.add('over'); } });
  document.addEventListener('dragleave', (ev) => { const c = ev.target.closest && ev.target.closest('.col'); if (c) c.classList.remove('over'); });
  document.addEventListener('drop', (ev) => { const c = ev.target.closest && ev.target.closest('.col'); if (c) { ev.preventDefault(); moveDeal(ev.dataTransfer.getData('text/plain'), c.dataset.stage); } });
  ACT.newDeal = () => { if (A.guard('crm')) A.openModal('newDeal'); };
  MO.newDeal = () => ({ title: 'New deal', html: `<form data-form="newDeal">${field('Deal name', '<input name="name" required maxlength="100">')}<div class="grid" style="grid-template-columns:1fr 1fr;gap:10px">${field('Account', `<select name="account">${opts(D().accounts.map((a) => [a.id, a.name]))}</select>`)}${field('Value ($)', '<input name="value" type="number" min="0" required value="25000">')}</div><div class="grid" style="grid-template-columns:1fr 1fr;gap:10px">${field('Stage', `<select name="stage">${opts(STAGES.slice(0, 4))}</select>`)}${field('Expected close', `<input name="close" type="date" required value="${fmtDate(Date.now() + 45 * 86400000)}">`)}</div><div class="acts"><button type="button" class="btn" data-a="closeModal">Cancel</button><button class="btn primary">Add deal</button></div></form>` });
  FORMS.newDeal = (v) => { D().deals.unshift({ id: 'd' + A.nextId('deal'), name: v.name.trim(), account: v.account, stage: v.stage, value: Number(v.value) || 0, prob: PROB[v.stage], owner: A.acct(v.account).owner, close: v.close }); A.closeModal(); A.commit('Created deal', v.name); A.toast('Deal added'); };

  /* ====================================================================
     CONTRACTS
     ==================================================================== */
  V.contracts = function () {
    const d = D(), act = d.contracts.filter((c) => c.status === 'Active'), soon = act.filter((c) => daysTo(c.end) <= 90);
    return head('Contracts & renewals', 'Every contract with its SLA tier and renewal risk') +
      `<div class="grid g4" style="margin-bottom:14px">${kpi('file', moneyFull(act.reduce((s, c) => s + c.value, 0)), 'Active contract value')}${kpi('clock', soon.length, 'Ending within 90 days', soon.length ? 'warn' : 'ok')}${kpi('alert', d.contracts.filter((c) => c.renewal === 'At risk' || c.status === 'Expired').length, 'At risk or expired', 'crit')}${kpi('shield', act.length, 'Active contracts')}</div>` +
      tbl([['Contract'], ['Customer'], ['SLA'], ['Term'], ['Value', 'num'], ['Ends in'], ['Renewal'], ['']], d.contracts.map((c) => { const dt = daysTo(c.end), a = A.acct(c.account), risky = c.status === 'Active' && dt <= 90 && a.health < 70; return `<tr><td><b>${e(c.name)}</b></td><td>${acctLink(c.account)}</td><td>${chip(c.sla, c.sla === 'Gold' ? 'warn' : '')}</td><td class="muted small">${c.start} to ${c.end}</td><td class="num">${moneyFull(c.value)}</td><td>${c.status === 'Expired' ? chip('Expired', 'crit') : chip(dt + ' days', dt <= 30 ? 'crit' : dt <= 90 ? 'warn' : 'ok')}</td><td>${chip(c.renewal, c.renewal === 'At risk' || c.renewal === 'Lost contact' ? 'crit' : c.renewal === 'Negotiating' ? 'info' : '')}${risky ? ' ' + chip('R14 risk', 'crit') : ''}</td><td><button class="btn sm" data-a="renew" data-id="${c.id}" ${A.dis('crm')}>${c.renewal === 'Negotiating' ? 'Mark renewed' : 'Start renewal'}</button></td></tr>`; }));
  };
  ACT.renew = (t) => {
    if (!A.guard('crm')) return; const c = D().contracts.find((x) => x.id === t.dataset.id);
    if (c.renewal === 'Negotiating') { c.end = fmtDate(new Date(c.end).getTime() + 365 * 86400000); c.status = 'Active'; c.renewal = 'Open'; A.toast('Contract renewed for 12 months', 'check'); A.commit('Renewed contract', c.name); }
    else { c.renewal = 'Negotiating'; D().deals.unshift({ id: 'd' + A.nextId('deal'), name: A.acct(c.account).name + ' - renewal', account: c.account, stage: 'Negotiation', value: c.value, prob: 70, owner: A.acct(c.account).owner, close: c.end }); A.toast('Renewal deal created in the pipeline', 'funnel'); A.commit('Started renewal', c.name); }
  };

  /* ====================================================================
     CMDB
     ==================================================================== */
  V.cmdb = function () {
    const d = D(), q = fv('m', 'q').toLowerCase(), tf = fv('m', 't'), sf = fv('m', 's'), st = fv('m', 'st');
    const rows = d.assets.filter((a) => (!tf || a.type === tf) && (!sf || a.site === sf) && (!st || a.status === st) && (!q || (a.name + ' ' + a.ip + ' ' + A.acct(a.account).name).toLowerCase().includes(q)));
    const types = [...new Set(d.assets.map((a) => a.type))];
    return head('CMDB', 'Configuration items, relationships and impact analysis', `<button class="btn primary" data-a="newAsset" ${A.dis('cmdb')}>${ic('plus', 14)}New asset</button>`) +
      `<div class="toolbar"><input id="m-q" data-filter="m.q" type="search" placeholder="Search name, IP or customer" value="${e(fv('m', 'q'))}" aria-label="Search assets" style="min-width:240px"><select id="m-t" data-filter="m.t" aria-label="Type">${opts([['', 'All types']].concat(types), tf)}</select><select id="m-s" data-filter="m.s" aria-label="Site">${opts([['', 'All sites']].concat(d.sites.map((s) => [s.id, s.name])), sf)}</select><select id="m-st" data-filter="m.st" aria-label="Lifecycle">${opts([['', 'Any lifecycle'], 'In service', 'Staging', 'Maintenance', 'Retired'], st)}</select><span class="sp"></span><span class="muted small">${rows.length} of ${d.assets.length} CIs</span></div>` +
      tbl([['Name'], ['Type'], ['Customer'], ['Site'], ['IP'], ['Lifecycle'], ['Criticality'], ['Warranty'], ['Health']], rows.map((a) => { const w = daysTo(a.warranty); return `<tr class="click" data-a="openAsset" data-id="${a.id}" tabindex="0" role="link"><td><b>${e(a.name)}</b></td><td>${e(a.type)}</td><td>${e(A.acct(a.account).name)}</td><td>${e(A.site(a.site).name)}</td><td><code>${e(a.ip)}</code></td><td>${chip(a.status, a.status === 'In service' ? 'ok' : a.status === 'Retired' ? '' : 'warn')}</td><td>${'*'.repeat(a.crit)}</td><td>${chip(w < 0 ? 'Expired' : w + ' d', w < 30 ? 'crit' : w < 90 ? 'warn' : '')}</td><td>${chip({ ok: 'Healthy', warn: 'Warning', crit: 'Critical' }[assetState(a)], assetState(a))}</td></tr>`; }));
  };
  ACT.newAsset = () => { if (A.guard('cmdb')) A.openModal('newAsset'); };
  MO.newAsset = () => ({ title: 'New configuration item', html: `<form data-form="newAsset">${field('Name', '<input name="name" required maxlength="60" pattern="[A-Za-z0-9._-]+" title="Letters, numbers, dot, dash">')}<div class="grid" style="grid-template-columns:1fr 1fr;gap:10px">${field('Type', `<select name="type">${opts(['Server', 'Switch', 'Router', 'Firewall', 'Database', 'Storage', 'Access point'])}</select>`)}${field('Lifecycle', `<select name="status">${opts(['Staging', 'In service'])}</select>`)}</div><div class="grid" style="grid-template-columns:1fr 1fr;gap:10px">${field('Customer', `<select name="account">${opts(D().accounts.map((a) => [a.id, a.name]))}</select>`)}${field('Site', `<select name="site">${opts(D().sites.map((s) => [s.id, s.name]))}</select>`)}</div><div class="grid" style="grid-template-columns:1fr 1fr;gap:10px">${field('IP address', '<input name="ip" required pattern="^(\\d{1,3}\\.){3}\\d{1,3}$" placeholder="10.10.2.50">')}${field('Depends on', `<select name="dep"><option value="">Nothing</option>${opts(D().assets.map((a) => [a.id, a.name]))}</select>`)}</div><div class="acts"><button type="button" class="btn" data-a="closeModal">Cancel</button><button class="btn primary">Add CI</button></div></form>` });
  FORMS.newAsset = (v) => {
    const d = D(), conflict = d.assets.find((a) => a.ip === v.ip);
    const a = { id: 'n' + A.nextId('asset'), name: v.name, type: v.type, site: v.site, account: v.account, status: v.status, ip: v.ip, crit: 2, warranty: fmtDate(Date.now() + 365 * 86400000), dep: v.dep ? [v.dep] : [], m: { cpu: 15, mem: 30, disk: 20 } };
    d.assets.push(a); A.closeModal();
    if (conflict) { const t = createTicket({ subject: 'IP conflict: ' + v.ip + ' used by ' + conflict.name + ' and ' + a.name, account: a.account, pri: 'P2', cat: 'Network', asset: a.id, source: 'Alert', by: 'System', desc: 'Rule R17 detected a duplicate address.' }); d.rules.find((r) => r.id === 'R17').hits++; A.toast('IP conflict detected - ticket #' + t.id + ' raised (R17)', 'alert'); } else A.toast('CI added');
    A.commit('Created CI', a.name);
  };
  DR.asset = function (id) {
    const a = A.asset(id); if (!a) return null; const tab = curTab('drawer', 'details'), d = D(), dn = downstream(id), up = [...upstream(id)].map(A.asset), al = d.alerts.filter((x) => x.asset === id && x.state !== 'resolved');
    const meter = (l, v) => `<div style="margin-bottom:8px"><div class="row small"><span>${l}</span><span class="sp"></span><b>${Math.round(v)}%</b></div>${barc(v, v > 85 ? 'crit' : v > 70 ? 'warn' : 'ok')}</div>`;
    let body = '';
    if (tab === 'details') body = dl([['Type', e(a.type)], ['Customer', acctLink(a.account)], ['Site', e(A.site(a.site).name)], ['IP address', `<code>${e(a.ip)}</code>`], ['Criticality', '*'.repeat(a.crit) + ' of 3'], ['Warranty', e(a.warranty) + ' (' + daysTo(a.warranty) + ' days)'], ['Lifecycle', A.can('cmdb') ? `<select data-onchange="assetStatus" data-id="${a.id}" aria-label="Lifecycle">${opts(['Staging', 'In service', 'Maintenance', 'Retired'], a.status)}</select>` : e(a.status)]]) + meter('CPU', a.m.cpu) + meter('Memory', a.m.mem) + meter('Disk', a.m.disk) + `<h4>Open alerts</h4><div class="list">${al.map((x) => `<div>${sevChip(x.sev)}<div class="grow"><b>${e(x.msg)}</b><span class="muted small">${ago(x.at)}</span></div></div>`).join('') || '<div class="muted">None</div>'}</div>`;
    else if (tab === 'rel') body = `<h4>Depends on</h4><div class="list">${a.dep.map((i) => `<div style="cursor:pointer" data-a="openAsset" data-id="${i}" role="link" tabindex="0">${ic('server', 14)}<div class="grow"><b>${e(A.asset(i).name)}</b><span class="muted small">${e(A.asset(i).type)}</span></div></div>`).join('') || '<div class="muted">Nothing (root of the chain)</div>'}</div><h4>Depended on by</h4><div class="list">${dn.map((x) => `<div style="cursor:pointer" data-a="openAsset" data-id="${x.id}" role="link" tabindex="0">${ic('server', 14)}<div class="grow"><b>${e(x.name)}</b><span class="muted small">${e(x.type)}</span></div></div>`).join('') || '<div class="muted">Nothing depends on this CI</div>'}</div><a class="btn sm" style="margin-top:12px" href="#/topology/${a.id}" data-a="closeDrawer">${ic('share', 12)}Show on topology</a>`;
    else { const accts = [...new Set(dn.map((x) => x.account))]; body = `<div class="card" style="background:${dn.length ? 'var(--warn-soft)' : 'var(--ok-soft)'};box-shadow:none;margin-bottom:12px"><b>${dn.length ? 'If ' + e(a.name) + ' fails, ' + dn.length + ' asset' + (dn.length > 1 ? 's' : '') + ' are affected' : 'No downstream impact'}</b></div>${dn.length ? `<h4>Affected customers</h4><div class="pill-row">${accts.map((i) => chip(A.acct(i).name, 'warn')).join('')}</div><h4>Affected assets</h4><div class="list">${dn.map((x) => `<div><div class="grow"><b>${e(x.name)}</b><span class="muted small">${e(A.acct(x.account).name)}</span></div>${chip('*'.repeat(x.crit), x.crit === 3 ? 'crit' : '')}</div>`).join('')}</div>` : ''}<h4>Upstream dependencies</h4><div class="pill-row">${up.map((x) => chip(x.name, '')).join('') || '<span class="muted">None</span>'}</div>`; }
    return { title: `<span style="display:flex;gap:10px;align-items:center">${ic('server', 18)}${e(a.name)}</span>`, html: tabs('drawer', [['details', 'Details'], ['rel', 'Relationships'], ['impact', 'Impact analysis']], 'details') + body };
  };
  ACT.assetStatus = (t) => { if (!A.guard('cmdb')) return; const a = A.asset(t.dataset.id); a.status = t.value; A.commit('Lifecycle changed to ' + t.value, a.name); };

  /* ====================================================================
     IPAM
     ==================================================================== */
  const ip2n = (ip) => ip.split('.').reduce((s, o) => s * 256 + Number(o), 0), n2ip = (n) => [Math.floor(n / 16777216) % 256, Math.floor(n / 65536) % 256, Math.floor(n / 256) % 256, n % 256].join('.');
  const cidr = (c) => { const [b, bits] = c.split('/'), size = Math.pow(2, 32 - Number(bits)), start = ip2n(b); return { start, size, hosts: size - 2 }; };
  const inCidr = (ip, c) => { const x = cidr(c), n = ip2n(ip); return n > x.start && n < x.start + x.size - 1; };
  function subnetStats(s) {
    const d = D(), c = cidr(s.cidr), as = d.assets.filter((a) => inCidr(a.ip, s.cidr)), used = s.base + as.length + s.reserved.length;
    const ips = {}; as.forEach((a) => (ips[a.ip] = (ips[a.ip] || 0) + 1));
    return { c, as, used, pct: (used / c.hosts) * 100, conflicts: Object.keys(ips).filter((k) => ips[k] > 1) };
  }
  V.ipam = function () {
    const d = D();
    return head('IPAM', 'Address space by subnet with utilisation and conflict detection') +
      `<div class="grid g3">${d.subnets.map((s) => { const x = subnetStats(s); return `<div class="card" style="cursor:pointer" data-a="openSubnet" data-id="${s.id}" tabindex="0" role="link"><div class="row"><b>${e(s.cidr)}</b><span class="sp"></span>${chip('VLAN ' + s.vlan, '')}</div><div class="muted small">${e(s.name)} - ${e(A.site(s.site).name)}</div><div style="margin:10px 0 4px">${barc(x.pct, x.pct > 85 ? 'crit' : x.pct > 70 ? 'warn' : 'ok')}</div><div class="row small"><span>${x.used} / ${x.c.hosts} used</span><span class="sp"></span><b>${Math.round(x.pct)}%</b></div>${x.pct > 85 ? `<div class="small" style="color:var(--crit)">Rule R18: above 85%</div>` : ''}${x.conflicts.length ? `<div class="small" style="color:var(--crit)">${x.conflicts.length} conflict(s)</div>` : ''}</div>`; }).join('')}</div>`;
  };
  ACT.openSubnet = (t) => A.openDrawer('subnet', t.dataset.id);
  DR.subnet = function (id) {
    const s = D().subnets.find((x) => x.id === id); if (!s) return null; const x = subnetStats(s);
    return { title: `${e(s.cidr)} <span class="muted small">${e(s.name)}</span>`, html: `<div class="row small"><span>${x.used} of ${x.c.hosts} addresses used</span><span class="sp"></span><b>${Math.round(x.pct)}%</b></div>${barc(x.pct, x.pct > 85 ? 'crit' : x.pct > 70 ? 'warn' : 'ok')}
      <div class="row" style="margin:14px 0"><button class="btn primary" data-a="reserveIp" data-id="${s.id}" ${A.dis('ipam')}>${ic('plus', 14)}Reserve next free IP</button></div>
      <h4>Assigned to configuration items</h4><div class="list">${x.as.map((a) => `<div style="cursor:pointer" data-a="openAsset" data-id="${a.id}" role="link" tabindex="0"><code>${e(a.ip)}</code><div class="grow"><b>${e(a.name)}</b><span class="muted small">${e(A.acct(a.account).name)}</span></div></div>`).join('') || '<div class="muted">None</div>'}</div>
      <h4>Reservations</h4><div class="list">${s.reserved.map((r, i) => `<div><code>${e(r.ip)}</code><div class="grow"><b>${e(r.label)}</b><span class="muted small">${ago(r.at)}</span></div><button class="btn sm danger" data-a="releaseIp" data-id="${s.id}" data-i="${i}" ${A.dis('ipam')}>Release</button></div>`).join('') || '<div class="muted">None</div>'}</div><p class="muted small">${s.base} more addresses are in use by DHCP and unmanaged devices.</p>` };
  };
  ACT.reserveIp = (t) => {
    if (!A.guard('ipam')) return; const d = D(), s = d.subnets.find((x) => x.id === t.dataset.id), c = cidr(s.cidr), taken = new Set(d.assets.map((a) => a.ip).concat(s.reserved.map((r) => r.ip)));
    for (let n = c.start + 1 + s.base; n < c.start + c.size - 1; n++) { if (!taken.has(n2ip(n))) { s.reserved.push({ ip: n2ip(n), label: 'Reserved by ' + A.ROLES[ui.role].user, at: Date.now() }); A.commit('Reserved IP ' + n2ip(n), s.cidr); A.toast('Reserved ' + n2ip(n), 'network'); return; } }
    A.toast('Subnet is full', 'alert');
  };
  ACT.releaseIp = (t) => { if (!A.guard('ipam')) return; const s = D().subnets.find((x) => x.id === t.dataset.id); const r = s.reserved.splice(Number(t.dataset.i), 1)[0]; A.commit('Released IP ' + r.ip, s.cidr); };

  /* ====================================================================
     AUTOMATION
     ==================================================================== */
  V.automation = function () {
    const d = D(), cats = [...new Set(d.rules.map((r) => r.cat))];
    return head('Automation rules', 'Twenty rules wire alerts, tickets, SLAs, CRM and CMDB together', `<button class="btn" data-a="simAlert" data-sev="critical" ${A.dis('alert')}>${ic('zap', 14)}Test with a critical alert</button>`) +
      `<div class="card" style="margin-bottom:14px;background:var(--info-soft);box-shadow:none">${ic('zap', 16)} Rules marked <b>Live in demo</b> really change what happens when you simulate alerts or create tickets (R1 auto-ticket, R3 de-duplication, R4 correlation, R5 maintenance, R19 Gold bump). The others are shown as configuration only in this static preview.</div>` +
      cats.map((c) => `<h3 style="margin:18px 0 8px">${e(c)}</h3><div class="grid g2">${d.rules.filter((r) => r.cat === c).map((r) => `<div class="card"><div class="row"><b>${e(r.id)}</b><b class="grow" style="flex:1">${e(r.name)}</b><label class="switch" aria-label="Toggle ${e(r.id)}"><input type="checkbox" data-toggle="toggleRule" data-id="${r.id}" ${r.enabled ? 'checked' : ''} ${A.dis('rules')}><span></span></label></div><div class="muted small" style="margin:6px 0">${e(r.desc)}</div><div class="row">${r.live ? chip('Live in demo', 'info') : chip('Config only', '')}<span class="sp"></span><span class="muted small">${r.hits} executions</span></div></div>`).join('')}</div>`).join('');
  };
  ACT.toggleRule = (t) => { if (!A.guard('rules')) { A.render(); return; } const r = D().rules.find((x) => x.id === t.dataset.id); r.enabled = t.checked; A.commit((r.enabled ? 'Enabled' : 'Disabled') + ' rule ' + r.id, r.name); };

  /* ====================================================================
     REPORTS
     ==================================================================== */
  V.reports = function () {
    const d = D(), cat = {}, ind = {}, sev = { critical: 0, warning: 0, info: 0 };
    d.tickets.forEach((t) => (cat[t.cat] = (cat[t.cat] || 0) + 1)); d.accounts.forEach((a) => (ind[a.industry] = (ind[a.industry] || 0) + a.arr)); d.alerts.forEach((a) => sev[a.sev]++);
    const tier = ['Gold', 'Silver', 'Bronze'].map((tr) => { const ts = d.tickets.filter((t) => (A.acct(t.account).tier) === tr); const ok = ts.filter((t) => { const s = sla(t); return s.res.state !== 'breached' && s.resp.state !== 'breached'; }).length; return { tr, n: ts.length, pct: ts.length ? Math.round((100 * ok) / ts.length) : 100 }; });
    const csat = d.tickets.filter((t) => t.csat), avg = csat.length ? (csat.reduce((s, t) => s + t.csat, 0) / csat.length).toFixed(1) : '-';
    return head('Reports', 'Service, revenue and infrastructure insight', `<button class="btn" data-a="exportAccounts">${ic('download', 14)}Accounts CSV</button><button class="btn" data-a="exportTickets">${ic('download', 14)}Tickets CSV</button>`) +
      `<div class="grid g4" style="margin-bottom:14px">${kpi('star', avg + ' / 5', 'Average CSAT', 'ok')}${kpi('ticket', d.tickets.length, 'Tickets in period')}${kpi('server', d.assets.length, 'Configuration items')}${kpi('dollar', moneyFull(d.accounts.reduce((s, a) => s + a.arr, 0)), 'ARR')}</div>` +
      `<div class="grid g2"><div class="card"><h3>Tickets by category</h3>${hbars(Object.entries(cat).map(([l, v]) => ({ l, v })).sort((a, b) => b.v - a.v))}</div>
       <div class="card"><h3>ARR by industry</h3>${hbars(Object.entries(ind).map(([l, v]) => ({ l, v })).sort((a, b) => b.v - a.v), money)}</div>
       <div class="card"><h3>SLA compliance by contract tier</h3>${tier.map((x) => `<div style="margin-bottom:10px"><div class="row small"><span>${x.tr} (${x.n} tickets)</span><span class="sp"></span><b>${x.pct}%</b></div>${barc(x.pct, x.pct < 80 ? 'crit' : x.pct < 95 ? 'warn' : 'ok')}</div>`).join('')}</div>
       <div class="card"><h3>Alerts by severity</h3><div class="row wrap" style="gap:24px">${donut([{ l: 'Critical', v: sev.critical, c: 'var(--crit)' }, { l: 'Warning', v: sev.warning, c: 'var(--warn)' }, { l: 'Info', v: sev.info, c: 'var(--info)' }])}${legend([{ l: 'Critical', v: sev.critical, c: 'var(--crit)' }, { l: 'Warning', v: sev.warning, c: 'var(--warn)' }, { l: 'Info', v: sev.info, c: 'var(--info)' }])}</div></div></div>`;
  };
  ACT.exportAccounts = () => download('accounts.csv', csv([['name', 'industry', 'tier', 'owner', 'health', 'arr']].concat(D().accounts.map((a) => [a.name, a.industry, a.tier, a.owner, a.health, a.arr]))));

  /* ====================================================================
     USERS, AUDIT, SETTINGS
     ==================================================================== */
  V.users = function () {
    const d = D(), R = A.ROLES, matrix = [['Dashboard & NOC', 'admin agent engineer account_manager noc'], ['Create / work tickets', 'admin agent engineer'], ['Accounts, pipeline, contracts', 'admin account_manager'], ['CMDB & IPAM changes', 'admin engineer'], ['Automation rules', 'admin engineer'], ['Users & audit', 'admin'], ['Customer portal only', 'customer']];
    return head('Users & access', 'Six roles with route-level permissions; customers are scoped to their own account', `<button class="btn primary" data-a="newUser" ${ui.role === 'admin' ? '' : 'disabled title="Administrators only"'}>${ic('plus', 14)}Invite user</button>`) +
      tbl([['User'], ['Email'], ['Role'], ['Status'], ['Last active'], ['']], d.users.map((u) => `<tr><td><div class="row"><div class="avatar">${initials(u.name)}</div><b>${e(u.name)}</b></div></td><td>${e(u.email)}</td><td>${e(R[u.role].label)}</td><td>${chip(u.status, u.status === 'Active' ? 'ok' : '')}</td><td class="muted">${ago(u.last)}</td><td><button class="btn sm" data-a="toggleUser" data-id="${u.id}" ${ui.role === 'admin' ? '' : 'disabled'}>${u.status === 'Active' ? 'Disable' : 'Enable'}</button></td></tr>`)) +
      `<h3 style="margin:20px 0 8px">Permission matrix</h3>` + tbl([['Capability']].concat(Object.keys(R).map((k) => [R[k].label])), matrix.map((m) => `<tr><td>${e(m[0])}</td>${Object.keys(R).map((k) => `<td>${m[1].split(' ').includes(k) ? `<span style="color:var(--ok)">${ic('check', 16)}</span>` : '<span class="muted">-</span>'}</td>`).join('')}</tr>`));
  };
  ACT.newUser = () => A.openModal('newUser');
  MO.newUser = () => ({ title: 'Invite user', html: `<form data-form="newUser">${field('Full name', '<input name="name" required maxlength="80">')}${field('Email', '<input name="email" type="email" required maxlength="120">')}${field('Role', `<select name="role">${opts(Object.keys(A.ROLES).map((k) => [k, A.ROLES[k].label]), 'agent')}</select>`)}<div class="acts"><button type="button" class="btn" data-a="closeModal">Cancel</button><button class="btn primary">Send invite</button></div></form>` });
  FORMS.newUser = (v) => { D().users.push({ id: 'u' + A.nextId('user'), name: v.name.trim(), email: v.email.trim(), role: v.role, status: 'Active', last: Date.now() }); A.closeModal(); A.commit('Invited user', v.email); A.toast('Invite sent to ' + v.email, 'mail'); };
  ACT.toggleUser = (t) => { const u = D().users.find((x) => x.id === t.dataset.id); u.status = u.status === 'Active' ? 'Disabled' : 'Active'; A.commit(u.status === 'Active' ? 'Enabled user' : 'Disabled user', u.email); };

  V.audit = function () {
    const q = fv('au', 'q').toLowerCase(), rows = D().audit.filter((x) => !q || (x.who + ' ' + x.what + ' ' + x.target).toLowerCase().includes(q));
    return head('Audit log', 'Every change made in this session, newest first') + `<div class="toolbar"><input id="au-q" data-filter="au.q" type="search" placeholder="Filter log" value="${e(fv('au', 'q'))}" aria-label="Filter audit log" style="min-width:240px"></div>` +
      tbl([['When'], ['Who'], ['Action'], ['Target']], rows.map((x) => `<tr><td class="muted">${ago(x.at)}</td><td>${e(x.who)}</td><td>${e(x.what)}</td><td>${e(x.target)}</td></tr>`));
  };

  V.settings = function () {
    return head('Settings', 'Appearance, data and about') +
      `<div class="grid g2"><div class="card"><h3>${ic('sun', 16)}Appearance</h3>${field('Theme', `<select data-onchange="setTheme" aria-label="Theme">${opts([['auto', 'Match system'], ['light', 'Light'], ['dark', 'Dark']], ui.theme)}</select>`)}<label class="row"><span class="switch"><input type="checkbox" data-toggle="setDense" ${ui.dense ? 'checked' : ''}><span></span></span> Compact density</label><div class="row" style="margin-top:14px"><button class="btn" data-a="fullscreen">${ic('expand', 14)}Toggle full screen</button></div></div>
       <div class="card"><h3>${ic('database', 16)}Demo data</h3><p class="muted">This preview stores every change in your browser only. Nothing is sent to a server.</p><div class="row wrap"><button class="btn" data-a="exportJson">${ic('download', 14)}Export JSON</button><button class="btn danger" data-a="resetDemo">${ic('refresh', 14)}Reset demo data</button></div></div>
       <div class="card"><h3>${ic('lock', 16)}Current session</h3>${dl([['Signed in as', e(A.ROLES[ui.role].user)], ['Role', e(A.ROLES[ui.role].label)]])}<p class="muted small">Use the <b>View as</b> menu in the top bar to experience each role's navigation and permissions.</p></div>
       <div class="card"><h3>${ic('layers', 16)}About</h3><p class="muted">${e(A.BRAND)} static preview. The full application (Node, PostgreSQL, edge collectors, SLA engine) lives in the main project; this build demonstrates the complete user experience with sample data.</p><p class="small muted">Shortcuts: <kbd>Ctrl</kbd>+<kbd>K</kbd> search - <kbd>Esc</kbd> close panels</p></div></div>`;
  };
  ACT.setTheme = (t) => { ui.theme = t.value; A.save(); A.render(); };
  ACT.setDense = (t) => { ui.dense = t.checked; A.save(); A.render(); };
  ACT.exportJson = () => download('presight-nexus-demo.json', JSON.stringify(D(), null, 2), 'application/json');
  ACT.resetDemo = () => { if (confirm('Reset all demo data to the original sample?')) A.reset(); };

  /* deep links such as #/tickets/1043 open the matching drawer */
  A.routeArg = (route, arg) => { const map = { tickets: 'ticket', accounts: 'account', cmdb: 'asset', kb: 'kb', ipam: 'subnet' }; if (map[route]) A.openDrawer(map[route], arg); };
})();
