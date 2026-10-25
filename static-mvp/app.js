'use strict';
/* Core: state, helpers, shell (sidebar/topbar), routing, overlays, global event handling. Views live in views.js. */
(function () {
  const KEY = 'ecrm-enterprise-v1';
  const APP = (window.APP = { views: {}, actions: {}, forms: {}, drawers: {}, modals: {}, BRAND: 'Presight CRM', DEV: 'Thirumal D' });

  /* ---------- helpers ---------- */
  const e = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ic = (n, sz = 18) => `<svg class="ic" width="${sz}" height="${sz}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${window.ICONS[n] || ''}</svg>`;
  const money = (n) => (n >= 1e6 ? '$' + (n / 1e6).toFixed(2) + 'M' : n >= 1e4 ? '$' + Math.round(n / 1000) + 'k' : '$' + Number(n).toLocaleString());
  const moneyFull = (n) => '$' + Number(n).toLocaleString();
  const initials = (n) => String(n).split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
  const fmtDur = (ms) => {
    const neg = ms < 0; let m = Math.round(Math.abs(ms) / 60000);
    const d = Math.floor(m / 1440); m -= d * 1440; const h = Math.floor(m / 60); m -= h * 60;
    const s = d ? `${d}d ${h}h` : h ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m`;
    return (neg ? '-' : '') + s;
  };
  const ago = (t) => fmtDur(Date.now() - t) + ' ago';
  const fmtDate = (t) => new Date(t).toISOString().slice(0, 10);
  const daysTo = (iso) => Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000);
  Object.assign(APP, { e, ic, money, moneyFull, initials, fmtDur, ago, fmtDate, daysTo });

  /* ---------- state ---------- */
  let D;
  const ui = (APP.ui = { route: 'dashboard', arg: null, drawer: null, modal: null, f: {}, sidebar: false, role: 'admin', theme: 'auto', dense: false, tab: {}, cmdSel: 0 });
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (raw && raw.v === 1) { D = raw.D; ui.role = raw.role || 'admin'; ui.theme = raw.theme || 'auto'; ui.dense = !!raw.dense; }
  } catch (_) { /* storage unavailable */ }
  if (!D) D = window.makeSeed();
  Object.defineProperty(APP, 'D', { get: () => D });
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify({ v: 1, D, role: ui.role, theme: ui.theme, dense: ui.dense })); } catch (_) {} };
  APP.save = save;
  APP.reset = () => { try { localStorage.removeItem(KEY); } catch (_) {} D = window.makeSeed(); ui.drawer = null; ui.modal = null; render(); toast('Demo data reset'); };

  /* ---------- lookups ---------- */
  APP.acct = (id) => D.accounts.find((a) => a.id === id);
  APP.asset = (id) => D.assets.find((a) => a.id === id);
  APP.site = (id) => D.sites.find((s) => s.id === id);
  APP.ticket = (id) => D.tickets.find((t) => t.id === Number(id));
  APP.nextId = (k) => D.seq[k]++;
  APP.audit = (what, target) => { D.audit.unshift({ at: Date.now(), who: roleUser().name, what, target: target || '' }); if (D.audit.length > 300) D.audit.length = 300; };

  /* ---------- roles ---------- */
  const ALLV = ['dashboard', 'noc', 'monitoring', 'topology', 'tickets', 'kb', 'portal', 'accounts', 'pipeline', 'contracts', 'cmdb', 'ipam', 'automation', 'reports', 'users', 'audit', 'settings'];
  const ROLES = {
    admin: { label: 'Administrator', views: ALLV, can: ['*'], user: 'Dana Admin' },
    agent: { label: 'Service agent', views: ['dashboard', 'noc', 'tickets', 'kb', 'accounts', 'cmdb', 'portal', 'settings'], can: ['ticket', 'alert'], user: 'Alice Agent' },
    engineer: { label: 'Engineer', views: ['dashboard', 'noc', 'monitoring', 'topology', 'tickets', 'kb', 'cmdb', 'ipam', 'automation', 'reports', 'settings'], can: ['ticket', 'alert', 'cmdb', 'ipam', 'monitor', 'rules'], user: 'Nina Network' },
    account_manager: { label: 'Account manager', views: ['dashboard', 'noc', 'tickets', 'kb', 'accounts', 'pipeline', 'contracts', 'reports', 'settings'], can: ['crm'], user: 'Mia Morgan' },
    noc: { label: 'NOC operator', views: ['dashboard', 'noc', 'monitoring', 'topology', 'tickets', 'settings'], can: ['alert'], user: 'Noah NOC' },
    customer: { label: 'Customer (portal)', views: ['portal', 'kb', 'settings'], can: ['portal'], user: 'Wendy Albrecht' },
  };
  APP.ROLES = ROLES;
  const roleUser = () => ({ name: ROLES[ui.role].user });
  const can = (p) => ROLES[ui.role].can.includes('*') || ROLES[ui.role].can.includes(p);
  APP.can = can;
  APP.dis = (p) => (can(p) ? '' : 'disabled title="Your role cannot do this"');
  APP.guard = (p) => { if (can(p)) return true; toast('Your role (' + ROLES[ui.role].label + ') cannot do that', 'lock'); return false; };

  /* ---------- navigation ---------- */
  const NAV = [
    ['Overview', [['dashboard', 'Dashboard', 'dashboard']]],
    ['Operations', [['noc', 'NOC & alerts', 'radar'], ['monitoring', 'Monitoring', 'activity'], ['topology', 'Topology', 'share']]],
    ['Service', [['tickets', 'Help desk', 'ticket'], ['kb', 'Knowledge base', 'book'], ['portal', 'Customer portal', 'globe']]],
    ['CRM', [['accounts', 'Accounts', 'building'], ['pipeline', 'Pipeline', 'funnel'], ['contracts', 'Contracts', 'file']]],
    ['Infrastructure', [['cmdb', 'CMDB', 'server'], ['ipam', 'IPAM', 'network']]],
    ['Insights & control', [['automation', 'Automation', 'zap'], ['reports', 'Reports', 'chart']]],
    ['Administration', [['users', 'Users & access', 'users'], ['audit', 'Audit log', 'shield'], ['settings', 'Settings', 'settings']]],
  ];
  const TITLES = {}; NAV.forEach((g) => g[1].forEach((i) => (TITLES[i[0]] = i[1])));
  APP.TITLES = TITLES;

  APP.go = (route, arg) => { location.hash = '#/' + route + (arg ? '/' + arg : ''); };
  function parseHash() {
    const m = location.hash.replace(/^#\/?/, '').split('/');
    ui.route = m[0] || 'dashboard'; ui.arg = m[1] || null;
    if (!ROLES[ui.role].views.includes(ui.route)) ui.route = ROLES[ui.role].views[0];
  }

  /* ---------- shell ---------- */
  const $ = (s) => document.querySelector(s);
  function openAlerts() { return D.alerts.filter((a) => a.state === 'open' && a.sev !== 'info').length; }
  function renderShell() {
    const r = ROLES[ui.role];
    $('#side').innerHTML = `<div class="brand"><img src="assets/presight-logo.png" alt="${e(APP.BRAND)}" width="170" height="49"></div><nav class="nav" aria-label="Main">` +
      NAV.map(([g, items]) => {
        const vis = items.filter((i) => r.views.includes(i[0]));
        return vis.length ? `<div class="nav-group"><h6>${e(g)}</h6>${vis.map((i) => `<a data-a="nav" data-id="${i[0]}" class="${ui.route === i[0] ? 'on' : ''}" tabindex="0" role="link">${ic(i[2])}<span>${e(i[1])}</span>${i[0] === 'noc' && openAlerts() ? `<span class="badge">${openAlerts()}</span>` : ''}</a>`).join('')}</div>` : '';
      }).join('') + '</nav><div class="dev-foot">Developed by <b>' + e(APP.DEV) + '</b></div>';
    $('#side').classList.toggle('on', ui.sidebar);
    $('#scrim').classList.toggle('on', ui.sidebar);
    $('#top').innerHTML = `<button class="iconbtn menu-btn" data-a="menu" aria-label="Open menu">${ic('menu')}</button>
      <h2>${e(TITLES[ui.route] || '')}</h2><div class="sp"></div>
      <div class="search" data-a="cmd" role="button" tabindex="0" aria-label="Search">${ic('search', 16)}<span>Search tickets, accounts, assets</span><kbd>Ctrl K</kbd></div>
      <label class="hide-m small muted" for="roleSel">View as</label>
      <select class="role hide-m" id="roleSel" data-change="role" aria-label="View as role">${Object.entries(ROLES).map(([k, v]) => `<option value="${k}" ${k === ui.role ? 'selected' : ''}>${e(v.label)}</option>`).join('')}</select>
      <button class="iconbtn" data-a="nav" data-id="noc" aria-label="Alerts">${ic('bell')}${openAlerts() ? `<span class="dot">${openAlerts()}</span>` : ''}</button>
      <button class="iconbtn" data-a="fullscreen" aria-label="Toggle full screen" title="Full screen">${ic('expand')}</button>
      <button class="iconbtn" data-a="theme" aria-label="Toggle theme" title="Theme">${ic(isDark() ? 'sun' : 'moon')}</button>
      <div class="avatar" title="${e(roleUser().name)}">${e(initials(roleUser().name))}</div>`;
  }
  const isDark = () => (ui.theme === 'dark' || (ui.theme === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches));
  function applyTheme() {
    document.documentElement.dataset.theme = isDark() ? 'dark' : 'light';
    document.documentElement.dataset.dense = ui.dense ? '1' : '0';
  }

  /* ---------- render ---------- */
  function render() {
    parseHash(); applyTheme(); renderShell();
    const main = $('#main');
    const prevScroll = main.scrollTop, prevRoute = main.dataset.route;
    const act = document.activeElement;
    const keep = act && act.id && main.contains(act) ? { id: act.id, s: act.selectionStart, en: act.selectionEnd } : null;
    const v = APP.views[ui.route];
    main.innerHTML = (v ? v() : '<div class="empty">Not found</div>') + '<footer class="foot">' + e(APP.BRAND) + ' &middot; Developed by ' + e(APP.DEV) + '</footer>';
    main.dataset.route = ui.route;
    main.scrollTop = prevRoute === ui.route ? prevScroll : 0;
    if (keep) { const el = document.getElementById(keep.id); if (el) { el.focus(); try { el.setSelectionRange(keep.s, keep.en); } catch (_) {} } }
    renderDrawer(); renderModal();
    if (APP.afterRender) APP.afterRender();
    document.title = (TITLES[ui.route] || APP.BRAND) + ' - ' + APP.BRAND;
  }
  APP.render = render;
  APP.commit = (auditWhat, target) => { if (auditWhat) APP.audit(auditWhat, target); save(); render(); };

  /* ---------- drawer / modal / toast ---------- */
  function renderDrawer() {
    const d = $('#drawer'), o = $('#dOverlay');
    if (!ui.drawer || !APP.drawers[ui.drawer.type]) { d.classList.remove('on'); o.classList.remove('on'); return; }
    const out = APP.drawers[ui.drawer.type](ui.drawer.id);
    if (!out) { ui.drawer = null; d.classList.remove('on'); o.classList.remove('on'); return; }
    const st = d.querySelector('.body') ? d.querySelector('.body').scrollTop : 0;
    d.innerHTML = `<header><h3>${out.title}</h3><button class="iconbtn" data-a="closeDrawer" aria-label="Close">${ic('x')}</button></header><div class="body">${out.html}</div>`;
    d.querySelector('.body').scrollTop = st;
    d.classList.add('on'); o.classList.add('on');
  }
  APP.openDrawer = (type, id) => { ui.drawer = { type, id }; ui.tab.drawer = null; renderDrawer(); };
  APP.closeDrawer = () => { ui.drawer = null; renderDrawer(); };
  function renderModal() {
    const m = $('#modal');
    if (!ui.modal || !APP.modals[ui.modal.type]) { m.classList.remove('on'); m.innerHTML = ''; return; }
    const out = APP.modals[ui.modal.type](ui.modal);
    m.innerHTML = `<div class="box" role="dialog" aria-modal="true" aria-label="${e(out.title)}"><header>${e(out.title)}<span class="sp"></span><button class="iconbtn" data-a="closeModal" aria-label="Close">${ic('x')}</button></header>${out.html}</div>`;
    m.classList.add('on');
    const first = m.querySelector('input,select,textarea'); if (first && !m.dataset.focused) { first.focus(); }
  }
  APP.openModal = (type, data) => { ui.modal = Object.assign({ type }, data || {}); renderModal(); };
  APP.closeModal = () => { ui.modal = null; renderModal(); };
  function toast(msg, icon) {
    const t = document.createElement('div'); t.className = 'toast'; t.setAttribute('role', 'status');
    t.innerHTML = ic(icon || 'check', 16) + '<span>' + e(msg) + '</span>';
    $('#toasts').appendChild(t); setTimeout(() => t.remove(), 3200);
  }
  APP.toast = toast;

  /* ---------- command palette ---------- */
  function cmdItems(q) {
    q = q.trim().toLowerCase(); const out = [];
    const r = ROLES[ui.role];
    NAV.forEach((g) => g[1].forEach((i) => { if (r.views.includes(i[0]) && (!q || i[1].toLowerCase().includes(q))) out.push({ icon: i[2], label: 'Go to ' + i[1], sub: 'Page', run: () => APP.go(i[0]) }); }));
    if (q.length >= 2 && r.views.includes('tickets')) D.tickets.filter((t) => ('#' + t.id + ' ' + t.subject).toLowerCase().includes(q)).slice(0, 6).forEach((t) => out.push({ icon: 'ticket', label: '#' + t.id + ' ' + t.subject, sub: 'Ticket', run: () => { APP.go('tickets'); APP.openDrawer('ticket', t.id); } }));
    if (q.length >= 2 && r.views.includes('accounts')) D.accounts.filter((a) => a.name.toLowerCase().includes(q)).slice(0, 5).forEach((a) => out.push({ icon: 'building', label: a.name, sub: 'Account', run: () => { APP.go('accounts'); APP.openDrawer('account', a.id); } }));
    if (q.length >= 2 && r.views.includes('cmdb')) D.assets.filter((a) => (a.name + ' ' + a.ip).toLowerCase().includes(q)).slice(0, 6).forEach((a) => out.push({ icon: 'server', label: a.name + ' (' + a.ip + ')', sub: 'Asset', run: () => { APP.go('cmdb'); APP.openDrawer('asset', a.id); } }));
    return out.slice(0, 12);
  }
  function renderCmd() {
    const m = $('#cmd'); if (!ui.cmd) { m.classList.remove('on'); m.innerHTML = ''; return; }
    const items = cmdItems(ui.cmd.q); ui.cmd.items = items; ui.cmdSel = Math.min(ui.cmdSel, Math.max(0, items.length - 1));
    m.innerHTML = `<div class="box" role="dialog" aria-label="Search"><input id="cmdIn" data-input="cmd" placeholder="Search or jump to..." value="${e(ui.cmd.q)}" autocomplete="off"><div class="res">${items.map((it, i) => `<a data-a="cmdRun" data-i="${i}" class="${i === ui.cmdSel ? 'sel' : ''}">${ic(it.icon, 16)}<span>${e(it.label)}</span><span class="muted small" style="margin-left:auto">${e(it.sub)}</span></a>`).join('') || '<div class="empty">No results</div>'}</div></div>`;
    m.classList.add('on'); const i = $('#cmdIn'); i.focus(); i.setSelectionRange(i.value.length, i.value.length);
  }
  function openCmd() { ui.cmd = { q: '' }; ui.cmdSel = 0; renderCmd(); }
  function closeCmd() { ui.cmd = null; renderCmd(); }

  /* ---------- events ---------- */
  document.addEventListener('click', (ev) => {
    const t = ev.target.closest('[data-a]'); if (!t) { if (ev.target.id === 'modal' ) APP.closeModal(); if (ev.target.id === 'cmd') closeCmd(); return; }
    const a = t.dataset.a, id = t.dataset.id;
    switch (a) {
      case 'nav': ui.sidebar = false; APP.closeDrawer(); APP.go(id); break;
      case 'menu': ui.sidebar = !ui.sidebar; renderShell(); break;
      case 'theme': ui.theme = isDark() ? 'light' : 'dark'; save(); render(); break;
      case 'fullscreen': document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen && document.documentElement.requestFullscreen().catch(() => toast('Full screen is blocked by the browser', 'alert')); break;
      case 'cmd': openCmd(); break;
      case 'cmdRun': { const it = ui.cmd.items[Number(t.dataset.i)]; closeCmd(); if (it) it.run(); break; }
      case 'closeDrawer': APP.closeDrawer(); break;
      case 'closeModal': APP.closeModal(); break;
      case 'tab': ui.tab[t.dataset.scope] = id; render(); break;
      default: if (APP.actions[a]) APP.actions[a](t, ev); else console.warn('no action', a);
    }
  });
  document.addEventListener('keydown', (ev) => {
    if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'k') { ev.preventDefault(); ui.cmd ? closeCmd() : openCmd(); return; }
    if (ev.key === 'Escape') { if (ui.cmd) closeCmd(); else if (ui.modal) APP.closeModal(); else if (ui.drawer) APP.closeDrawer(); else if (ui.sidebar) { ui.sidebar = false; renderShell(); } return; }
    if (ui.cmd) {
      if (ev.key === 'ArrowDown') { ui.cmdSel = Math.min(ui.cmdSel + 1, ui.cmd.items.length - 1); renderCmd(); ev.preventDefault(); }
      else if (ev.key === 'ArrowUp') { ui.cmdSel = Math.max(ui.cmdSel - 1, 0); renderCmd(); ev.preventDefault(); }
      else if (ev.key === 'Enter') { const it = ui.cmd.items[ui.cmdSel]; closeCmd(); if (it) it.run(); }
      return;
    }
    if ((ev.key === 'Enter' || ev.key === ' ') && ev.target.matches && ev.target.matches('[role="link"],[role="button"]')) { ev.preventDefault(); ev.target.click(); }
  });
  document.addEventListener('input', (ev) => {
    const t = ev.target;
    if (t.dataset.input === 'cmd') { ui.cmd.q = t.value; ui.cmdSel = 0; renderCmd(); }
    else if (t.dataset.filter) { const [scope, key] = t.dataset.filter.split('.'); (ui.f[scope] = ui.f[scope] || {})[key] = t.value; render(); }
  });
  document.addEventListener('change', (ev) => {
    const t = ev.target;
    if (t.dataset.change === 'role') { ui.role = t.value; ui.drawer = null; ui.modal = null; save(); parseHash(); location.hash = '#/' + ROLES[ui.role].views[0]; render(); toast('Now viewing as ' + ROLES[ui.role].label, 'eye'); }
    else if (t.dataset.filter) { const [scope, key] = t.dataset.filter.split('.'); (ui.f[scope] = ui.f[scope] || {})[key] = t.value; render(); }
    else if (t.dataset.toggle && APP.actions[t.dataset.toggle]) APP.actions[t.dataset.toggle](t, ev);
    else if (t.dataset.onchange && APP.actions[t.dataset.onchange]) APP.actions[t.dataset.onchange](t, ev);
  });
  document.addEventListener('submit', (ev) => {
    const f = ev.target.closest('form[data-form]'); if (!f) return; ev.preventDefault();
    const fn = APP.forms[f.dataset.form]; if (fn) fn(Object.fromEntries(new FormData(f).entries()), f);
  });
  window.addEventListener('hashchange', () => { ui.sidebar = false; render(); if (ui.arg && APP.routeArg) APP.routeArg(ui.route, ui.arg); });
  matchMedia('(prefers-color-scheme: dark)').addEventListener && matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if (ui.theme === 'auto') render(); });

  /* ---------- live ticking: SLA clocks + simulated telemetry ---------- */
  setInterval(() => { if (!document.hidden && !ui.modal && !ui.cmd && !(document.activeElement && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName))) { if (APP.tick) APP.tick(); render(); } }, 5000);

  /* ---------- boot ---------- */
  window.addEventListener('DOMContentLoaded', () => {
    $('#app').innerHTML = `<aside class="side" id="side"></aside><header class="top" id="top"></header><main id="main" tabindex="-1"></main>
      <div class="scrim" id="scrim" data-a="menu"></div><div class="overlay" id="dOverlay" data-a="closeDrawer"></div><aside class="drawer" id="drawer" aria-label="Details"></aside>
      <div class="modal" id="modal"></div><div class="modal cmd" id="cmd"></div><div class="toasts" id="toasts" aria-live="polite"></div>`;
    if (!location.hash) location.hash = '#/' + ROLES[ui.role].views[0];
    render();
    if (ui.arg && APP.routeArg) APP.routeArg(ui.route, ui.arg);
  });
})();
