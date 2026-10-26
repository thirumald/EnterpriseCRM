'use strict';
/* Smart city modules: Command centre (PSIM), Video management (VMS) and the Intelli City platform view.
   Video feeds are simulated scenes, not real streams. Depends on app.js and views.js. */
(function () {
  const A = window.APP, { e, ic, ago, fmtDur } = A, U = A.ui2;
  const { head, kpi, chip, sevChip, barc, opts, fv, tabs, curTab, empty, tbl, field, dl, assetLink } = U;
  const ui = A.ui, V = A.views, ACT = A.actions, FORMS = A.forms, DR = A.drawers, MO = A.modals;
  const D = () => A.D;

  /* ---------- reference data ---------- */
  const CITY = { Tirana: [19.82, 41.33], 'Durrës': [19.45, 41.32], 'Vlorë': [19.49, 40.47], 'Shkodër': [19.51, 42.07], 'Korçë': [20.78, 40.62] };
  const CITY_ACCT = { Tirana: 'a1', 'Durrës': 'a3', 'Vlorë': 'a4', 'Shkodër': 'a5', 'Korçë': 'a8' };
  const OUTLINE = [[19.37, 42.55], [19.65, 42.62], [20.0, 42.55], [20.35, 42.55], [20.55, 42.2], [20.6, 41.85], [20.5, 41.5], [20.85, 41.1], [21.05, 40.9], [20.98, 40.6], [20.7, 40.3], [20.4, 40.05], [20.15, 39.7], [20.0, 39.65], [19.95, 39.9], [19.5, 40.25], [19.35, 40.65], [19.4, 41.0], [19.45, 41.4], [19.4, 41.8], [19.4, 42.1]];
  const proj = (ll) => [(ll[0] - 19.0) * 150, (42.8 - ll[1]) * 150];
  const hash = (s) => { let h = 7; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h; };
  const TYPES = {
    'ANPR watchlist hit': { sev: 'high', an: 'ANPR', sop: ['Verify the plate match on the VMS clip', 'Confirm vehicle make and colour', 'Notify the nearest police patrol', 'Share the last-seen location and direction', 'Record the outcome and close'] },
    'Crowd density above limit': { sev: 'medium', an: 'Crowd', sop: ['Check live view and crowd density trend', 'Alert the municipal events officer', 'Open alternative routes on variable signs', 'Request additional patrol if density keeps rising', 'Record the outcome and close'] },
    'Smoke detected': { sev: 'critical', an: 'Smoke', sop: ['Confirm smoke on the camera and thermal view', 'Dispatch the nearest fire unit', 'Notify the site security lead', 'Close affected traffic or access routes', 'Record the outcome and close'] },
    'Perimeter intrusion': { sev: 'high', an: 'Intrusion', sop: ['Verify the intrusion on the VMS clip', 'Dispatch the nearest patrol', 'Activate the loudspeaker warning if available', 'Notify the facility owner', 'Record the outcome and close'] },
    'Traffic collision': { sev: 'high', an: 'Collision', sop: ['Confirm the collision and number of vehicles', 'Dispatch police and ambulance', 'Set variable message signs upstream', 'Notify the road maintenance crew', 'Record the outcome and close'] },
    'Street light cluster fault': { sev: 'low', infra: true, sop: ['Confirm the fault cluster on the lighting controller', 'Create a work order for the lighting crew', 'Notify the municipality', 'Verify repair and close'] },
    'Smart bin overflow': { sev: 'low', infra: true, sop: ['Confirm fill level on the sensor', 'Assign the nearest collection crew', 'Verify the bins are emptied', 'Close'] },
    'Air quality threshold exceeded': { sev: 'medium', infra: true, sop: ['Check neighbouring stations for correlation', 'Notify the environment department', 'Publish an advisory on the citizen app if sustained', 'Record the outcome and close'] },
    'Operator report': { sev: 'medium', sop: ['Verify the report on the video wall', 'Dispatch the appropriate unit', 'Record the outcome and close'] },
  };
  const LOCS = { 'Street light cluster fault': ['Vlorë seafront, 11 luminaires', 'Tirana Blloku, 6 luminaires', 'Shkodër lakeside, 9 luminaires'], 'Smart bin overflow': ['Durrës promenade, bin cluster 2', 'Tirana Grand Park, bin cluster 5'], 'Air quality threshold exceeded': ['Tirana city centre station', 'Korçë bazaar station'] };
  const sevCls = { critical: 'crit', high: 'warn', medium: 'info', low: '' };
  const statusCls = { new: 'crit', acknowledged: 'warn', dispatched: 'info', resolved: 'ok' };
  const sopFor = (inc) => { if (!inc.sop) { const t = TYPES[inc.type] || TYPES['Operator report']; inc.sop = t.sop.map((x, i) => ({ t: x, done: i < (inc.sopDone || 0) })); } return inc.sop; };
  const cam = (id) => D().cameras.find((c) => c.id === id);
  const inc = (id) => D().incidents.find((x) => x.id === Number(id));
  const unit = (id) => D().units.find((x) => x.id === id);
  const active = () => D().incidents.filter((x) => x.status !== 'resolved');
  const camDot = (c) => (c.status === 'online' ? 'var(--ok)' : c.status === 'degraded' ? 'var(--warn)' : 'var(--crit)');

  /* ---------- video tiles: looping MP4 clips (media/*.mp4), pooled so they keep playing across re-renders ---------- */
  const sceneOf = (c) => (c.type === 'ANPR' ? 'road' : /bus|stn/i.test(c.name) ? 'terminal' : c.type === 'Thermal' || /PRT/.test(c.name) ? 'port' : /BCH|SEA|LAK/.test(c.name) ? 'promenade' : 'plaza');
  const VP = {}, clock = () => new Date().toLocaleTimeString('en-GB');
  function vidFor(key, c) {
    let v = VP[key]; if (v) return v;
    const h = hash(c.id), src = (window.VIDEO_SOURCES && window.VIDEO_SOURCES[c.id]) || 'media/' + sceneOf(c) + '.mp4';
    v = document.createElement('video'); v.muted = true; v.loop = true; v.autoplay = true; v.playsInline = true; v.preload = 'auto'; v.setAttribute('aria-hidden', 'true'); v.disablePictureInPicture = true;
    v.className = 'vid v' + (h % 4); v.src = src; v.playbackRate = 0.92 + (h % 17) / 100;
    v.addEventListener('loadedmetadata', () => { try { v.currentTime = (h % 1500) / 100; } catch (_) { /* not seekable yet */ } });
    v.addEventListener('error', () => { v.remove(); });
    VP[key] = v; return v;
  }
  function attachVideos() {
    document.querySelectorAll('.feed[data-key]').forEach((el) => {
      if (el.classList.contains('off')) return;
      const c = cam(el.dataset.cam); if (!c) return; const v = vidFor(el.dataset.key, c), slot = el.querySelector('.vslot');
      if (slot && v.parentNode !== slot) slot.appendChild(v);
      if (v.paused && v.isConnected) { const p = v.play(); if (p && p.catch) p.catch(() => {}); }
    });
    Object.keys(VP).forEach((k) => { const v = VP[k]; if (!v.isConnected && !v.paused) v.pause(); });
  }
  setInterval(() => { const t = clock(); document.querySelectorAll('.feed .ts').forEach((n) => { n.textContent = t; }); }, 1000);
  function feed(c, opt) {
    opt = opt || {};
    const off = c.status === 'offline', key = (opt.ctx || (opt.big ? 'drawer' : 'wall')) + ':' + c.id;
    return `<div class="feed ${off ? 'off' : ''} ${c.status === 'degraded' ? 'degraded' : ''} ${opt.big ? 'big' : ''}" data-cam="${e(c.id)}" data-key="${e(key)}" ${opt.noclick ? '' : `data-a="openCamera" data-id="${e(c.id)}" role="button" tabindex="0"`} aria-label="Camera ${e(c.name)}, ${e(c.status)}">
      <div class="scene"></div><div class="vslot"></div>
      <div class="ov top"><span class="nm">${e(c.name)}</span>${off ? '<span class="live off">OFFLINE</span>' : c.status === 'degraded' ? '<span class="live warn">DEGRADED</span>' : '<span class="live">LIVE</span>'}</div>
      <div class="ov bot"><span class="ts">${off ? '--:--:--' : clock()}</span><span>${e(c.res)} ${e(c.type)}</span></div>${off ? '<div class="nosig"><span>No signal</span></div>' : ''}${opt.flag ? `<div class="flag">${e(opt.flag)}</div>` : ''}</div>`;
  }

  /* ---------- domain operations ---------- */
  function createIncident(o) {
    const d = D(), meta = TYPES[o.type] || TYPES['Operator report'], r22 = d.rules.find((r) => r.id === 'R22');
    const x = { id: A.nextId('incident'), type: o.type, sev: o.sev || meta.sev, city: o.city, location: o.location, camera: o.camera || null, source: o.source || 'Operator', at: Date.now(), status: 'new', ackAt: null, units: [], ticket: null, timeline: [{ at: Date.now(), by: o.by || 'System', text: 'Incident created from ' + (o.source || 'Operator') }] };
    sopFor(x); d.incidents.unshift(x);
    if (meta.infra && r22 && r22.enabled) {
      const t = A.createTicket({ subject: o.type + ': ' + o.location, account: CITY_ACCT[o.city] || 'a1', pri: 'P3', cat: 'Application', source: 'Alert', by: 'System', desc: 'Raised by rule R22 from command centre incident #' + x.id + '.' });
      x.ticket = t.id; r22.hits++; x.timeline.push({ at: Date.now(), by: 'System', text: 'Rule R22 opened help desk ticket #' + t.id });
    }
    return x;
  }
  A.createIncident = createIncident;
  const logEvent = (c, kind, text, incident) => { D().vmsEvents.unshift({ at: Date.now(), camera: c ? c.id : null, kind, text, incident: incident || null }); if (D().vmsEvents.length > 60) D().vmsEvents.length = 60; };

  /* ====================================================================
     COMMAND CENTRE (PSIM)
     ==================================================================== */
  function cityMap(selId) {
    const d = D(), poly = OUTLINE.map((p) => proj(p).map((n) => n.toFixed(1)).join(',')).join(' ');
    const cams = d.cameras.map((c) => { const [x, y] = proj(CITY[c.city]), h = hash(c.id), a = (h % 360) * Math.PI / 180, r = 10 + (h % 9); return `<circle cx="${(x + Math.cos(a) * r).toFixed(1)}" cy="${(y + Math.sin(a) * r).toFixed(1)}" r="3" fill="${camDot(c)}" opacity=".85"><title>${e(c.name)} (${e(c.status)})</title></circle>`; }).join('');
    const cities = Object.keys(CITY).map((n) => { const [x, y] = proj(CITY[n]), k = active().filter((i) => i.city === n).length; return `<g><circle cx="${x}" cy="${y}" r="5" fill="var(--brand)" opacity=".25"/><circle cx="${x}" cy="${y}" r="2.5" fill="var(--brand)"/><text x="${n === 'Durrës' ? x - 9 : x + 9}" y="${y + 4}" ${n === 'Durrës' ? 'text-anchor="end"' : ''} font-weight="600" style="font-size:11px;fill:var(--text)">${e(n)}${k ? ' (' + k + ')' : ''}</text></g>`; }).join('');
    const col = { critical: 'var(--crit)', high: 'var(--warn)', medium: 'var(--info)', low: 'var(--muted)' };
    const marks = active().map((i) => { const [x, y] = proj(CITY[i.city]), h = hash('i' + i.id), a = (h % 360) * Math.PI / 180, r = 24 + (h % 12), cx = x + Math.cos(a) * r, cy = y + Math.sin(a) * r; return `<g data-a="openIncident" data-id="${i.id}" style="cursor:pointer" tabindex="0" role="button" aria-label="Incident ${i.id} ${e(i.type)}"><circle class="pulse" cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="9" fill="${col[i.sev]}" opacity=".35"/><circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="5.5" fill="${col[i.sev]}" stroke="#fff" stroke-width="${selId === i.id ? 3 : 1.5}"/><title>#${i.id} ${e(i.type)} - ${e(i.city)}</title></g>`; }).join('');
    return `<svg class="cmap" viewBox="0 0 330 500" role="img" aria-label="Schematic map of Albania with cameras and active incidents"><polygon class="land" points="${poly}"/>${cams}${cities}${marks}<text x="8" y="494" style="font-size:9px">Schematic map, not to scale</text></svg>`;
  }
  /* ---------- Geoapify live map (Leaflet + Geoapify raster tiles). Falls back to the schematic map without a key. ---------- */
  const LEAFLET = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/';
  const geoKey = () => { let k = ''; try { k = localStorage.getItem('geoapify-key') || ''; } catch (_) { /* storage blocked */ } return (k || window.GEOAPIFY_KEY || '').trim(); };
  const GM = (A.GM = { map: null, el: null, layer: null, tile: null, style: '', loading: false, failed: false, errs: 0, ok: 0, view: false });
  const isDark = () => document.documentElement.dataset.theme === 'dark';
  const geoStyle = () => (isDark() ? 'dark-matter' : 'osm-bright');
  const tileUrl = () => 'https://maps.geoapify.com/v1/tile/' + geoStyle() + '/{z}/{x}/{y}{r}.png?apiKey=' + encodeURIComponent(geoKey());
  function loadLeaflet() {
    if (window.L) return Promise.resolve();
    return new Promise((res, rej) => {
      const css = document.createElement('link'); css.rel = 'stylesheet'; css.href = LEAFLET + 'leaflet.min.css'; document.head.appendChild(css);
      const js = document.createElement('script'); js.src = LEAFLET + 'leaflet.min.js'; js.onload = res; js.onerror = rej; document.head.appendChild(js);
    });
  }
  const jitter = (id, city, scale) => { const h = hash(id), a = (h % 360) * Math.PI / 180, r = scale * (0.4 + (h % 7) / 10); return [CITY[city][1] + Math.sin(a) * r, CITY[city][0] + Math.cos(a) * r * 1.3]; };
  function buildMap() {
    const L = window.L; GM.el = document.createElement('div'); GM.el.className = 'gm';
    GM.map = L.map(GM.el, { zoomControl: true, attributionControl: true, minZoom: 6 }).fitBounds([[39.7, 19.2], [42.65, 21.05]]);
    GM.style = geoStyle(); GM.errs = 0; GM.ok = 0;
    GM.tile = L.tileLayer(tileUrl(), { maxZoom: 19, detectRetina: true, attribution: 'Powered by <a href="https://www.geoapify.com/" target="_blank" rel="noopener">Geoapify</a> | &copy; <a href="https://openmaptiles.org/" target="_blank" rel="noopener">OpenMapTiles</a> &copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors' }).addTo(GM.map);
    GM.tile.on('tileload', () => { GM.ok++; }).on('tileerror', () => { GM.errs++; if (GM.errs === 4 && !GM.ok) { A.toast('Geoapify rejected the tile requests. Check the API key in Settings.', 'alert'); } });
    GM.layer = L.layerGroup().addTo(GM.map);
  }
  function drawLayers(selId) {
    const L = window.L, d = D(), col = { critical: '#d92d20', high: '#b54708', medium: '#175cd3', low: '#667085' };
    if (GM.style !== geoStyle()) { GM.style = geoStyle(); GM.tile.setUrl(tileUrl()); }
    GM.layer.clearLayers();
    Object.keys(CITY).forEach((n) => { const k = active().filter((i) => i.city === n).length; L.marker([CITY[n][1], CITY[n][0]], { icon: L.divIcon({ className: '', html: `<div class="cm-label">${e(n)}${k ? ' <b>' + k + '</b>' : ''}</div>`, iconSize: [0, 0] }), interactive: false, keyboard: false }).addTo(GM.layer); });
    d.cameras.forEach((c) => { const ll = jitter(c.id, c.city, 0.018); L.circleMarker(ll, { radius: 5, color: '#fff', weight: 1.5, fillColor: c.status === 'online' ? '#067647' : c.status === 'degraded' ? '#b54708' : '#d92d20', fillOpacity: 1 }).bindTooltip(c.name + ' (' + c.status + ')').on('click', () => A.openDrawer('camera', c.id)).addTo(GM.layer); });
    active().forEach((i) => { const ll = i.camera ? jitter(i.camera, cam(i.camera).city, 0.018) : jitter('i' + i.id, i.city, 0.03); L.marker(ll, { icon: L.divIcon({ className: '', html: `<span class="pin" style="--pc:${col[i.sev]}${selId === i.id ? ';outline:3px solid #2f5bea' : ''}"></span>`, iconSize: [18, 18], iconAnchor: [9, 9] }), title: '#' + i.id + ' ' + i.type, zIndexOffset: 500 }).on('click', () => { ui.psimSel = i.id; A.openDrawer('incident', i.id); }).addTo(GM.layer); });
  }
  const liveMap = () => !!geoKey() && !GM.failed;
  const mapBlock = (selId) => (liveMap() ? '<div id="mapSlot" class="mapslot" data-sel="' + (selId || '') + '"><div class="empty">Loading map...</div></div>' : cityMap(selId) + (geoKey() ? '<p class="muted small">Live map unavailable (could not load the map library). Showing the schematic map.</p>' : '<p class="muted small">Showing a schematic map. Add a Geoapify API key in Settings to switch to a live street map.</p>'));
  const mapRender = function () {
    if (ui.route !== 'psim' || !liveMap()) return;
    const slot = document.getElementById('mapSlot'); if (!slot) return;
    if (!GM.map) { if (GM.loading) return; GM.loading = true; loadLeaflet().then(() => { GM.loading = false; buildMap(); A.render(); }).catch(() => { GM.loading = false; GM.failed = true; A.render(); }); return; }
    const sel = Number(slot.dataset.sel) || null;
    slot.innerHTML = ''; slot.appendChild(GM.el); GM.map.invalidateSize(); drawLayers(sel);
    if (sel && GM.focus !== sel) { GM.focus = sel; const i = inc(sel); if (i) GM.map.flyTo(jitter(i.camera || 'i' + i.id, i.camera ? cam(i.camera).city : i.city, 0.018), Math.max(GM.map.getZoom(), 12), { duration: 0.8 }); }
  };
  A.afterRender = function () { mapRender(); attachVideos(); };

  V.psim = function () {
    const d = D(), act = active(), crit = act.filter((x) => x.sev === 'critical').length, free = d.units.filter((x) => x.status === 'available').length;
    const acked = d.incidents.filter((x) => x.ackAt), avg = acked.length ? acked.reduce((s, x) => s + (x.ackAt - x.at), 0) / acked.length : 0;
    const tab = curTab('pq', 'active'), sf = fv('p', 's', '');
    const rows = d.incidents.filter((x) => (tab === 'all' || (tab === 'active' ? x.status !== 'resolved' : x.status === 'resolved')) && (!sf || x.sev === sf));
    const sel = d.incidents.find((x) => x.id === ui.psimSel) || act[0];
    const wallCams = sel ? [sel.camera ? cam(sel.camera) : null].concat(d.cameras.filter((c) => c.city === sel.city && c.id !== sel.camera)).filter(Boolean).slice(0, 4) : [];
    return head('Command centre (PSIM)', 'Physical security information management: video analytics, sensors and field units in one incident workflow',
      `<button class="btn" data-a="newIncident" ${A.dis('psim')}>${ic('plus', 14)}Report incident</button><button class="btn danger" data-a="simEvent" ${A.dis('psim')}>${ic('zap', 14)}Simulate analytics event</button>`) +
      `<div class="grid g4" style="margin-bottom:14px">${kpi('siren', act.length, 'Active incidents', act.length ? 'warn' : 'ok')}${kpi('alert', crit, 'Critical', crit ? 'crit' : 'ok')}${kpi('clock', acked.length ? fmtDur(avg) : '-', 'Avg. time to acknowledge')}${kpi('users', free + '/' + d.units.length, 'Units available', free ? 'ok' : 'crit')}${kpi('camera', d.cameras.filter((c) => c.status === 'online').length + '/' + d.cameras.length, 'Cameras online')}</div>` +
      `<div class="grid" style="grid-template-columns:minmax(280px,380px) minmax(0,1fr);align-items:start;margin-bottom:14px"><div class="card"><h3>${ic('map', 16)}Situation map<span class="sp"></span><span class="muted small">${liveMap() ? 'Live map by Geoapify' : 'Schematic'}</span></h3>${mapBlock(sel && sel.id)}<div class="legend"><span><i style="background:var(--crit)"></i>Critical</span><span><i style="background:var(--warn)"></i>High</span><span><i style="background:var(--info)"></i>Medium</span><span><i style="background:var(--ok);border-radius:50%"></i>Camera</span></div></div>
       <div><div class="toolbar">${tabs('pq', [['active', `Active (${act.length})`], ['resolved', 'Resolved'], ['all', 'All']], 'active').replace('class="tabs"', 'class="tabs" style="margin:0;flex:1"')}<select id="p-s" data-filter="p.s" aria-label="Severity">${opts([['', 'All severities'], 'critical', 'high', 'medium', 'low'], sf)}</select></div>
       ${tbl([['Sev'], ['Incident'], ['City'], ['Status'], ['Age'], ['Units']], rows.map((x) => `<tr class="click" data-a="openIncident" data-id="${x.id}" tabindex="0" role="link"><td>${chip(x.sev, sevCls[x.sev])}</td><td><b>#${x.id} ${e(x.type)}</b><div class="muted small">${e(x.location)}</div></td><td>${e(x.city)}</td><td>${chip(x.status, statusCls[x.status])}</td><td class="muted">${fmtDur(Date.now() - x.at)}</td><td>${x.units.map((u) => e(unit(u).name.split(' ').slice(-1)[0])).join(', ') || '-'}</td></tr>`))}</div></div>` +
      `<div class="card fs-target" style="margin-bottom:14px"><h3>${ic('camera', 16)}Video wall${sel ? ' - ' + e(sel.city) + ' (#' + sel.id + ')' : ''}<span class="sp"></span><span class="muted small">Sample footage</span><button class="btn sm" data-a="wallFs" aria-label="Full screen">${ic('fullscreen', 14)}Full screen</button></h3>${wallCams.length ? `<div class="wall w4">${wallCams.map((c, i) => feed(c, { flag: i === 0 && sel.camera ? 'INCIDENT' : '' })).join('')}</div>` : empty('No active incident selected')}</div>` +
      `<div class="card"><h3>${ic('users', 16)}Field units</h3><div class="grid g3">${d.units.map((u) => `<div class="row" style="padding:6px 0;border-bottom:1px solid var(--line)"><div class="grow" style="flex:1"><b>${e(u.name)}</b><div class="muted small">${e(u.kind)} - ${e(u.city)}</div></div>${chip(u.status, u.status === 'available' ? 'ok' : 'warn')}</div>`).join('')}</div></div>`;
  };
  ACT.wallFs = (t) => { const el = t.closest('.fs-target'); if (!el) return; if (document.fullscreenElement) document.exitFullscreen(); else if (el.requestFullscreen) el.requestFullscreen().catch(() => A.toast('Full screen is blocked by the browser', 'alert')); };
  ACT.openIncident = (t) => { ui.psimSel = Number(t.dataset.id); A.openDrawer('incident', t.dataset.id); };
  ACT.simEvent = () => {
    if (!A.guard('psim')) return; const d = D(), r21 = d.rules.find((r) => r.id === 'R21');
    let o;
    if (Math.random() < 0.7) {
      const pool = d.cameras.filter((c) => c.status !== 'offline'), c = pool[Math.floor(Math.random() * pool.length)], an = c.analytics[Math.floor(Math.random() * c.analytics.length)];
      const type = Object.keys(TYPES).find((k) => TYPES[k].an === an);
      o = { type, city: c.city, location: c.name.replace(/^[A-Z]+-[A-Z]+-\d+ /, ''), camera: c.id, source: 'VMS analytics', cam: c };
    } else {
      const type = Object.keys(LOCS)[Math.floor(Math.random() * 3)], loc = LOCS[type][Math.floor(Math.random() * LOCS[type].length)];
      o = { type, city: loc.split(' ')[0], location: loc, camera: null, source: 'IoT sensor' };
    }
    if (o.cam) logEvent(o.cam, TYPES[o.type].an, o.type + ' detected', null);
    if (!r21.enabled) { A.commit('Analytics event logged (R21 off)', o.type); A.toast('Event logged only: rule R21 is disabled, no incident opened', 'eye'); return; }
    const x = createIncident(o); r21.hits++; if (o.cam) D().vmsEvents[0].incident = x.id; ui.psimSel = x.id;
    A.commit('Incident created', '#' + x.id + ' ' + x.type); A.toast('Incident #' + x.id + ': ' + x.type + (x.ticket ? ' (ticket #' + x.ticket + ')' : ''), 'siren');
  };
  ACT.newIncident = () => { if (A.guard('psim')) A.openModal('newIncident'); };
  MO.newIncident = () => ({ title: 'Report incident', html: `<form data-form="newIncident">${field('Type', `<select name="type">${opts(Object.keys(TYPES), 'Operator report')}</select>`)}<div class="grid" style="grid-template-columns:1fr 1fr;gap:10px">${field('City', `<select name="city">${opts(Object.keys(CITY))}</select>`)}${field('Severity', `<select name="sev">${opts(['critical', 'high', 'medium', 'low'], 'medium')}</select>`)}</div>${field('Location', '<input name="location" required maxlength="120">')}${field('Related camera', `<select name="camera"><option value="">None</option>${opts(D().cameras.map((c) => [c.id, c.name]))}</select>`)}<div class="acts"><button type="button" class="btn" data-a="closeModal">Cancel</button><button class="btn primary">Create incident</button></div></form>` });
  FORMS.newIncident = (v) => { const x = createIncident({ type: v.type, sev: v.sev, city: v.city, location: v.location.trim(), camera: v.camera || null, source: 'Operator', by: A.ROLES[ui.role].user }); ui.psimSel = x.id; A.closeModal(); A.commit('Incident created', '#' + x.id); A.toast('Incident #' + x.id + ' created'); };

  DR.incident = function (id) {
    const x = inc(id); if (!x) return null; const d = D(), c = x.camera ? cam(x.camera) : null, sop = sopFor(x), done = sop.filter((s) => s.done).length, w = A.can('psim');
    const avail = d.units.filter((u) => u.status === 'available').sort((a, b) => (b.city === x.city) - (a.city === x.city));
    const dis = w ? '' : 'disabled title="Your role cannot do this"';
    return {
      title: `#${x.id} ${e(x.type)}`,
      html: `<div class="pill-row" style="margin-bottom:12px">${chip(x.sev, sevCls[x.sev])}${chip(x.status, statusCls[x.status])}${chip(x.source, '')}</div>
      ${dl([['City', e(x.city)], ['Location', e(x.location)], ['Camera', c ? `<a data-a="openCamera" data-id="${c.id}" style="color:var(--brand);cursor:pointer" role="link" tabindex="0">${e(c.name)}</a>` : '-'], ['Reported', ago(x.at)], ['Help desk', x.ticket ? `<a data-a="openTicket" data-id="${x.ticket}" style="color:var(--brand);cursor:pointer" role="link" tabindex="0">Ticket #${x.ticket}</a>` : '-']])}
      ${c ? `<div style="margin-bottom:14px">${feed(c, { big: true, flag: 'INCIDENT' })}</div>` : ''}
      <div class="row wrap" style="margin-bottom:14px">${x.status === 'new' ? `<button class="btn primary" data-a="incAck" data-id="${x.id}" ${dis}>${ic('check', 14)}Acknowledge</button>` : ''}${x.status !== 'resolved' ? `<button class="btn" data-a="incEscalate" data-id="${x.id}" ${dis}>${ic('alert', 14)}Escalate</button><button class="btn" data-a="incResolve" data-id="${x.id}" ${dis}>${ic('check', 14)}Resolve</button>` : `<button class="btn" data-a="incReopen" data-id="${x.id}" ${dis}>${ic('refresh', 14)}Reopen</button>`}${!x.ticket ? `<button class="btn" data-a="incTicket" data-id="${x.id}" ${A.dis('ticket')}>${ic('ticket', 14)}Create ticket</button>` : ''}</div>
      <h4 style="margin:0 0 6px">Standard operating procedure <span class="muted small">${done}/${sop.length}</span></h4>${barc((done / sop.length) * 100, done === sop.length ? 'ok' : '')}
      <div style="margin:8px 0 14px">${sop.map((s, i) => `<label class="row" style="padding:5px 0"><input type="checkbox" data-toggle="sopToggle" data-id="${x.id}" data-i="${i}" ${s.done ? 'checked' : ''} ${w ? '' : 'disabled'}><span style="${s.done ? 'text-decoration:line-through;color:var(--muted)' : ''}">${e(s.t)}</span></label>`).join('')}</div>
      <h4 style="margin:0 0 6px">Dispatched units</h4><div class="list" style="margin-bottom:10px">${x.units.map((u) => `<div><div class="grow"><b>${e(unit(u).name)}</b><span class="muted small">${e(unit(u).kind)} - ${e(unit(u).city)}</span></div><button class="btn sm" data-a="unitRelease" data-id="${x.id}" data-u="${u}" ${dis}>Release</button></div>`).join('') || '<div class="muted">None dispatched</div>'}</div>
      ${x.status !== 'resolved' ? `<form data-form="dispatch" data-id="${x.id}" class="row" style="margin-bottom:14px"><select name="unit" required aria-label="Unit" style="flex:1" ${dis}><option value="">Select a unit</option>${avail.map((u) => `<option value="${u.id}">${e(u.name)} (${e(u.city)})</option>`).join('')}</select><button class="btn primary" ${dis}>Dispatch</button></form>` : ''}
      <h4 style="margin:0 0 6px">Timeline</h4>${x.timeline.slice().reverse().map((t) => `<div class="comment"><div class="row small"><b>${e(t.by)}</b><span class="sp"></span><span class="muted">${ago(t.at)}</span></div>${e(t.text)}</div>`).join('')}
      <form data-form="incNote" data-id="${x.id}" style="margin-top:8px"><textarea name="text" required placeholder="Add an operator note" aria-label="Operator note" ${dis}></textarea><div class="row" style="margin-top:8px"><span class="sp"></span><button class="btn" ${dis}>Add note</button></div></form>`,
    };
  };
  const stamp = (x, text) => x.timeline.push({ at: Date.now(), by: A.ROLES[ui.role].user, text });
  ACT.incAck = (t) => { if (!A.guard('psim')) return; const x = inc(t.dataset.id); x.status = 'acknowledged'; x.ackAt = Date.now(); stamp(x, 'Acknowledged'); A.commit('Incident acknowledged', '#' + x.id); };
  ACT.incResolve = (t) => { if (!A.guard('psim')) return; const x = inc(t.dataset.id); x.status = 'resolved'; if (!x.ackAt) x.ackAt = Date.now(); x.units.forEach((u) => (unit(u).status = 'available')); x.units = []; stamp(x, 'Resolved, units released'); A.commit('Incident resolved', '#' + x.id); };
  ACT.incReopen = (t) => { if (!A.guard('psim')) return; const x = inc(t.dataset.id); x.status = 'acknowledged'; stamp(x, 'Reopened'); A.commit('Incident reopened', '#' + x.id); };
  ACT.incEscalate = (t) => { if (!A.guard('psim')) return; const x = inc(t.dataset.id), order = ['low', 'medium', 'high', 'critical'], i = Math.min(3, order.indexOf(x.sev) + 1); x.sev = order[i]; stamp(x, 'Escalated to ' + x.sev); A.commit('Incident escalated', '#' + x.id + ' to ' + x.sev); };
  ACT.incTicket = (t) => { if (!A.guard('ticket')) return; const x = inc(t.dataset.id), tk = A.createTicket({ subject: x.type + ': ' + x.location, account: CITY_ACCT[x.city] || 'a1', pri: x.sev === 'critical' ? 'P1' : x.sev === 'high' ? 'P2' : 'P3', cat: 'Application', source: 'Alert', by: 'System', desc: 'Created from command centre incident #' + x.id + '.' }); x.ticket = tk.id; stamp(x, 'Help desk ticket #' + tk.id + ' created'); A.commit('Ticket from incident', '#' + tk.id); A.toast('Ticket #' + tk.id + ' created'); };
  ACT.sopToggle = (t) => { if (!A.guard('psim')) { A.render(); return; } const x = inc(t.dataset.id), s = sopFor(x)[Number(t.dataset.i)]; s.done = t.checked; stamp(x, (s.done ? 'Completed: ' : 'Reopened step: ') + s.t); A.commit(); };
  ACT.unitRelease = (t) => { if (!A.guard('psim')) return; const x = inc(t.dataset.id), u = unit(t.dataset.u); x.units = x.units.filter((i) => i !== u.id); u.status = 'available'; stamp(x, 'Released ' + u.name); A.commit('Released unit', u.name); };
  FORMS.dispatch = (v, f) => { if (!A.guard('psim')) return; const x = inc(f.dataset.id), u = unit(v.unit); if (!u || u.status !== 'available') return; u.status = 'dispatched'; x.units.push(u.id); if (x.status === 'new') { x.status = 'dispatched'; x.ackAt = x.ackAt || Date.now(); } else if (x.status === 'acknowledged') x.status = 'dispatched'; stamp(x, 'Dispatched ' + u.name); A.commit('Dispatched unit', u.name + ' to #' + x.id); A.toast(u.name + ' dispatched', 'siren'); };
  FORMS.incNote = (v, f) => { if (!A.guard('psim')) return; const x = inc(f.dataset.id); stamp(x, v.text.trim()); A.commit('Incident note', '#' + x.id); };

  /* ====================================================================
     VMS
     ==================================================================== */
  const GB_DAY = { '4K': 90, '1080p': 38 };
  const CAP_TB = { s1: 420, s2: 90, s3: 60, s4: 70 };
  function storage(siteId) {
    const cs = D().cameras.filter((c) => c.site === siteId), need = cs.reduce((s, c) => s + ((GB_DAY[c.res] * (c.rec === 'event' ? 0.3 : 1) * c.retention) / 1000), 0);
    return { n: cs.length, need, cap: CAP_TB[siteId] || 50, pct: (need / (CAP_TB[siteId] || 50)) * 100 };
  }
  V.vms = function () {
    const d = D(), tab = curTab('vq', 'live'), on = d.cameras.filter((c) => c.status === 'online').length, bad = d.cameras.length - on;
    let body = '';
    if (tab === 'live') {
      const lay = fv('v', 'l', '9'), city = fv('v', 'c', ''), list = d.cameras.filter((c) => !city || c.city === city).slice(0, Number(lay));
      body = `<div class="fs-target"><div class="toolbar"><select id="v-l" data-filter="v.l" aria-label="Layout">${opts([['4', '2 x 2'], ['9', '3 x 3'], ['16', '4 x 4']], lay)}</select><select id="v-c" data-filter="v.c" aria-label="City">${opts([['', 'All cities']].concat(Object.keys(CITY)), city)}</select><span class="sp"></span><span class="muted small">Sample footage. Click a tile for controls.</span><button class="btn" data-a="wallFs">${ic('fullscreen', 14)}Full screen</button></div><div class="wall w${lay}">${list.map((c) => feed(c)).join('')}</div></div>`;
    } else if (tab === 'cameras') {
      const q = fv('v', 'q').toLowerCase(), st = fv('v', 's');
      body = `<div class="toolbar"><input id="v-q" data-filter="v.q" type="search" placeholder="Search cameras" value="${e(fv('v', 'q'))}" aria-label="Search cameras" style="min-width:220px"><select id="v-s" data-filter="v.s" aria-label="Status">${opts([['', 'Any status'], 'online', 'degraded', 'offline'], st)}</select><span class="sp"></span><button class="btn primary" data-a="newCamera" ${A.dis('vms')}>${ic('plus', 14)}Add camera</button></div>` +
        tbl([['Camera'], ['City'], ['Type'], ['Resolution'], ['Analytics'], ['Recording'], ['Retention'], ['Status']], d.cameras.filter((c) => (!st || c.status === st) && (!q || (c.name + ' ' + c.city).toLowerCase().includes(q))).map((c) => `<tr class="click" data-a="openCamera" data-id="${c.id}" tabindex="0" role="link"><td><b>${e(c.name)}</b></td><td>${e(c.city)}</td><td>${e(c.type)}</td><td>${e(c.res)}</td><td>${c.analytics.map((a) => chip(a, 'info')).join(' ')}</td><td>${e(c.rec)}</td><td>${c.retention} d</td><td>${chip(c.status, { online: 'ok', degraded: 'warn', offline: 'crit' }[c.status])}</td></tr>`));
    } else if (tab === 'storage') {
      body = `<div class="grid g2">${d.sites.map((s) => { const x = storage(s.id); return `<div class="card"><div class="row"><b>${e(s.name)}</b><span class="sp"></span>${chip(x.n + ' cameras', '')}</div><div class="row small" style="margin:10px 0 4px"><span>${x.need.toFixed(1)} TB needed of ${x.cap} TB</span><span class="sp"></span><b>${Math.round(x.pct)}%</b></div>${barc(x.pct, x.pct > 85 ? 'crit' : x.pct > 70 ? 'warn' : 'ok')}${x.pct > 85 ? '<div class="small" style="color:var(--crit);margin-top:6px">Retention exceeds capacity. Reduce retention or add storage.</div>' : ''}</div>`; }).join('')}</div><div class="card" style="margin-top:14px"><h3>${ic('database', 16)}Linked infrastructure</h3><div class="list"><div><div class="grow"><b>VMS recording server</b><span class="muted small">Tirana National DC</span></div>${assetLink('n6')}</div><div><div class="grow"><b>Primary storage</b><span class="muted small">Tirana National DC</span></div>${assetLink('n4')}</div><div><div class="grow"><b>Camera and sensor database</b><span class="muted small">GIS and metadata</span></div>${assetLink('n5')}</div></div></div>`;
    } else {
      body = tbl([['When'], ['Camera'], ['Analytic'], ['Event'], ['Incident']], d.vmsEvents.map((v) => `<tr><td class="muted">${ago(v.at)}</td><td>${v.camera ? e(cam(v.camera).name) : '-'}</td><td>${chip(v.kind, 'info')}</td><td>${e(v.text)}</td><td>${v.incident ? `<a data-a="openIncident" data-id="${v.incident}" style="color:var(--brand);cursor:pointer" role="link" tabindex="0">#${v.incident}</a>` : '<span class="muted">Logged only</span>'}</td></tr>`));
    }
    return head('Video management (VMS)', 'Cameras, recording and video analytics across the Tirana national DC and edge sites', `<button class="btn" data-a="nav" data-id="psim">${ic('siren', 14)}Open command centre</button>`) +
      `<div class="grid g4" style="margin-bottom:14px">${kpi('camera', d.cameras.length, 'Cameras')}${kpi('check', on, 'Online', 'ok')}${kpi('alert', bad, 'Degraded or offline', bad ? 'warn' : 'ok')}${kpi('activity', d.vmsEvents.length, 'Analytics events')}</div>` +
      tabs('vq', [['live', 'Live wall'], ['cameras', 'Cameras'], ['storage', 'Recording & storage'], ['events', 'Analytics events']], 'live') + body;
  };
  ACT.newCamera = () => { if (A.guard('vms')) A.openModal('newCamera'); };
  MO.newCamera = () => ({ title: 'Add camera', html: `<form data-form="newCamera">${field('Name', '<input name="name" required maxlength="60">')}<div class="grid" style="grid-template-columns:1fr 1fr;gap:10px">${field('City', `<select name="city">${opts(Object.keys(CITY))}</select>`)}${field('Type', `<select name="type">${opts(['Fixed', 'PTZ', 'ANPR', 'Thermal', 'Panoramic'])}</select>`)}</div><div class="grid" style="grid-template-columns:1fr 1fr;gap:10px">${field('Resolution', `<select name="res">${opts(['1080p', '4K'])}</select>`)}${field('Retention (days)', `<select name="ret">${opts([7, 14, 30, 60, 90], 30)}</select>`)}</div><div class="acts"><button type="button" class="btn" data-a="closeModal">Cancel</button><button class="btn primary">Add camera</button></div></form>` });
  FORMS.newCamera = (v) => { const site = { Tirana: 's1', 'Durrës': 's2', 'Vlorë': 's3', 'Korçë': 's3', 'Shkodër': 's4' }[v.city]; D().cameras.push({ id: 'c' + (100 + D().cameras.length), name: v.name.trim(), city: v.city, type: v.type, analytics: v.type === 'ANPR' ? ['ANPR'] : ['Crowd'], status: 'online', res: v.res, site, retention: Number(v.ret), rec: 'continuous' }); A.closeModal(); A.commit('Camera added', v.name); A.toast('Camera added'); };
  ACT.openCamera = (t) => A.openDrawer('camera', t.dataset.id);
  DR.camera = function (id) {
    const c = cam(id); if (!c) return null; const w = A.can('vms'), dis = w ? '' : 'disabled title="Your role cannot do this"', inc2 = D().incidents.filter((x) => x.camera === id && x.status !== 'resolved');
    return {
      title: `<span style="display:flex;gap:10px;align-items:center">${ic('camera', 18)}${e(c.name)}</span>`,
      html: `<div style="margin-bottom:12px">${feed(c, { big: true, noclick: true })}</div>
      ${c.type === 'PTZ' ? `<div class="row wrap" style="margin-bottom:12px"><span class="muted small">PTZ</span>${['Left', 'Up', 'Down', 'Right', 'Zoom in', 'Zoom out'].map((p) => `<button class="btn sm" data-a="ptz" data-p="${p}" ${dis}>${p}</button>`).join('')}</div>` : ''}
      ${dl([['Status', chip(c.status, { online: 'ok', degraded: 'warn', offline: 'crit' }[c.status])], ['City', e(c.city)], ['Type', e(c.type) + ', ' + e(c.res)], ['Recording site', e(A.site(c.site).name)], ['Recording mode', `<select data-onchange="camRec" data-id="${c.id}" aria-label="Recording mode" ${dis}>${opts([['continuous', 'Continuous'], ['event', 'Event only']], c.rec)}</select>`], ['Retention', `<select data-onchange="camRet" data-id="${c.id}" aria-label="Retention" ${dis}>${opts([7, 14, 30, 60, 90].map((n) => [n, n + ' days']), c.retention)}</select>`], ['Active incidents', inc2.map((x) => `<a data-a="openIncident" data-id="${x.id}" style="color:var(--brand);cursor:pointer" role="link" tabindex="0">#${x.id}</a>`).join(', ') || 'None']])}
      <h4 style="margin:0 0 6px">Video analytics</h4><div class="row wrap" style="margin-bottom:14px">${['ANPR', 'Crowd', 'Intrusion', 'Smoke', 'Collision'].map((a) => `<label class="row small"><input type="checkbox" data-toggle="camAn" data-id="${c.id}" data-an="${a}" ${c.analytics.includes(a) ? 'checked' : ''} ${w ? '' : 'disabled'}>${a}</label>`).join('')}</div>
      <div class="row wrap"><button class="btn" data-a="camSnap" data-id="${c.id}">${ic('camera', 14)}Snapshot</button><button class="btn" data-a="camBookmark" data-id="${c.id}">${ic('star', 14)}Bookmark</button><button class="btn" data-a="camToggle" data-id="${c.id}" ${dis}>${ic(c.status === 'offline' ? 'play' : 'pause', 14)}${c.status === 'offline' ? 'Bring online' : 'Take offline'}</button><button class="btn danger" data-a="camIncident" data-id="${c.id}" ${A.dis('psim')}>${ic('siren', 14)}Create incident</button></div>`,
    };
  };
  ACT.ptz = (t) => { if (A.guard('vms')) A.toast('PTZ command sent: ' + t.dataset.p, 'camera'); };
  ACT.camSnap = () => A.toast('Snapshot saved to the evidence store', 'camera');
  ACT.camBookmark = (t) => { const c = cam(t.dataset.id); logEvent(c, 'Bookmark', 'Operator bookmark at ' + new Date().toISOString().slice(11, 19), null); A.commit('Bookmarked video', c.name); A.toast('Bookmark added'); };
  ACT.camRec = (t) => { if (!A.guard('vms')) { A.render(); return; } const c = cam(t.dataset.id); c.rec = t.value; A.commit('Recording mode ' + t.value, c.name); };
  ACT.camRet = (t) => { if (!A.guard('vms')) { A.render(); return; } const c = cam(t.dataset.id); c.retention = Number(t.value); A.commit('Retention ' + t.value + ' days', c.name); };
  ACT.camAn = (t) => { if (!A.guard('vms')) { A.render(); return; } const c = cam(t.dataset.id), a = t.dataset.an; c.analytics = t.checked ? c.analytics.concat([a]) : c.analytics.filter((x) => x !== a); A.commit('Analytics ' + a + (t.checked ? ' on' : ' off'), c.name); };
  ACT.camToggle = (t) => { if (!A.guard('vms')) return; const c = cam(t.dataset.id); c.status = c.status === 'offline' ? 'online' : 'offline'; A.commit('Camera ' + c.status, c.name); };
  ACT.camIncident = (t) => { if (!A.guard('psim')) return; const c = cam(t.dataset.id), x = createIncident({ type: 'Operator report', city: c.city, location: c.name, camera: c.id, source: 'Operator', by: A.ROLES[ui.role].user }); ui.psimSel = x.id; A.commit('Incident created', '#' + x.id); A.toast('Incident #' + x.id + ' created from camera'); A.openDrawer('incident', x.id); };

  /* ====================================================================
     INTELLI CITY PLATFORM
     ==================================================================== */
  const IC = (A.IC = { rate: 1840, hist: Array.from({ length: 24 }, () => 1800 + Math.random() * 120) });
  const baseTick = A.tick;
  A.tick = function () { baseTick(); IC.rate = Math.max(900, Math.min(3200, IC.rate + (Math.random() * 160 - 80))); IC.hist.push(IC.rate); if (IC.hist.length > 24) IC.hist.shift(); };
  function archSvg() {
    const d = D(), dev = d.domains.reduce((s, x) => s + Object.values(x.cities).reduce((a, c) => a + c[0], 0), 0);
    const box = (x, y, w, h, t, s, cls) => `<g class="ab ${cls || ''}"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="8"/><text x="${x + w / 2}" y="${y + h / 2 - 2}" text-anchor="middle" font-weight="600">${e(t)}</text><text class="sub" x="${x + w / 2}" y="${y + h / 2 + 13}" text-anchor="middle">${e(s)}</text></g>`;
    const arrow = (x1, y1, x2, y2) => `<path d="M${x1},${y1} L${x2},${y2}" class="arr" marker-end="url(#ah)"/>`;
    const f = ['Cameras & ANPR', 'Lighting & traffic', 'Waste & parking', 'Environment & meters'], apps = ['PSIM command centre', 'VMS', 'Help desk & CRM', 'Citizen app & open data'];
    return `<svg viewBox="0 0 900 300" class="arch" role="img" aria-label="Intelli City architecture: field devices, edge DCs, platform core, applications"><defs><marker id="ah" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="var(--muted)"/></marker></defs>
      <text x="80" y="18" class="lbl">Field layer (${dev.toLocaleString()} devices)</text><text x="330" y="18" class="lbl">Edge DCs</text><text x="540" y="18" class="lbl">Intelli City core</text><text x="770" y="18" class="lbl">Applications</text>
      ${f.map((t, i) => box(10, 30 + i * 64, 150, 50, t, i === 0 ? d.cameras.length + ' cameras' : 'IoT sensors')).join('')}
      ${d.sites.map((s, i) => box(250, 30 + i * 64, 160, 50, s.name, s.collector === 'online' ? 'collector online' : 'collector offline', s.collector === 'online' ? '' : 'bad')).join('')}
      ${box(480, 30, 170, 62, 'Data ingestion & rules', Math.round(IC.rate).toLocaleString() + ' msgs/s')}${box(480, 106, 170, 62, 'Digital twin & GIS', 'db-gis-01')}${box(480, 182, 170, 62, 'Integration API gateway', 'REST, MQTT, ONVIF')}
      ${apps.map((t, i) => box(730, 30 + i * 64, 160, 50, t, '')).join('')}
      ${[0, 1, 2, 3].map((i) => arrow(160, 55 + i * 64, 250, 55 + i * 64)).join('')}${[0, 1, 2, 3].map((i) => arrow(410, 55 + i * 64, 480, 61 + (i % 3) * 76)).join('')}${[0, 1, 2, 3].map((i) => arrow(650, 61 + (i % 3) * 76, 730, 55 + i * 64)).join('')}</svg>`;
  }
  V.intellicity = function () {
    const d = D(), tab = curTab('ic', 'overview'), tot = d.domains.reduce((s, x) => s + Object.values(x.cities).reduce((a, c) => a + c[0], 0), 0), off = d.domains.reduce((s, x) => s + Object.values(x.cities).reduce((a, c) => a + c[1], 0), 0);
    const integ = [['PSIM command centre', 'psim', 'ok', '12 ms'], ['Video management (VMS)', 'vms', d.cameras.some((c) => c.status === 'offline') ? 'warn' : 'ok', '18 ms'], ['Help desk and CRM', 'tickets', 'ok', '9 ms'], ['GIS and digital twin', 'cmdb', 'ok', '24 ms'], ['Emergency dispatch', 'psim', 'ok', '31 ms'], ['Citizen mobile app', null, 'warn', '210 ms'], ['Open data API', null, 'ok', '45 ms']];
    let body;
    if (tab === 'overview') body = `<div class="card" style="margin-bottom:14px"><h3>${ic('layers', 16)}Solution architecture</h3><div style="overflow:auto">${archSvg()}</div></div>
      <div class="grid g2"><div class="card"><h3>${ic('activity', 16)}Platform throughput<span class="sp"></span><b>${Math.round(IC.rate).toLocaleString()} msgs/s</b></h3>${U.spark(IC.hist).replace('width="90" height="26"', 'width="100%" height="60" preserveAspectRatio="none"')}</div>
      <div class="card"><h3>${ic('share', 16)}Integrations</h3><div class="list">${integ.map((i) => `<div><div class="grow"><b>${e(i[0])}</b><span class="muted small">latency ${i[3]}</span></div>${chip(i[2] === 'ok' ? 'connected' : 'degraded', i[2])}${i[1] ? `<button class="btn sm" data-a="nav" data-id="${i[1]}">Open</button>` : ''}</div>`).join('')}</div></div></div>`;
    else body = `<div class="grid g3">${d.domains.map((m) => { const dev = Object.values(m.cities).reduce((a, c) => a + c[0], 0), o = Object.values(m.cities).reduce((a, c) => a + c[1], 0), pct = ((dev - o) / dev) * 100; return `<div class="card"><div class="row"><div class="kpi"><div class="ico">${ic(m.icon, 20)}</div></div><div style="flex:1"><b>${e(m.name)}</b><div class="muted small">${e(m.desc)}</div></div></div><div class="row" style="margin:12px 0 4px"><b style="font-size:20px">${e(m.value)}</b><span class="muted small">${e(m.metric)}</span></div><div class="row small"><span>${dev.toLocaleString()} devices</span><span class="sp"></span><b>${pct.toFixed(1)}% online</b></div>${barc(pct, pct < 97 ? 'warn' : 'ok')}<div class="small muted" style="margin-top:8px">${Object.entries(m.cities).map(([c, v]) => e(c) + ' ' + v[0].toLocaleString()).join(' - ')}</div></div>`; }).join('')}</div>`;
    return head('Intelli City platform', 'Integrated smart-city solution: IoT, video and analytics feeding the command centre, help desk and CRM') +
      `<div class="grid g4" style="margin-bottom:14px">${kpi('city', tot.toLocaleString(), 'Connected devices')}${kpi('check', ((100 * (tot - off)) / tot).toFixed(1) + '%', 'Devices online', 'ok')}${kpi('siren', active().length, 'Active incidents', active().length ? 'warn' : 'ok')}${kpi('map', Object.keys(CITY).length, 'Cities live')}</div>` +
      tabs('ic', [['overview', 'Platform'], ['domains', 'Smart city services']], 'overview') + body;
  };

  /* dashboard widget */
  const oldDash = V.dashboard;
  V.dashboard = function () {
    const html = oldDash(), d = D(), act = active();
    const card = `<div class="grid g3" style="margin-top:14px"><div class="card"><h3>${ic('siren', 16)}Command centre<span class="sp"></span><a class="btn sm" data-a="nav" data-id="psim" role="link" tabindex="0">Open</a></h3><div class="list">${act.slice(0, 4).map((x) => `<div style="cursor:pointer" data-a="openIncident" data-id="${x.id}" role="link" tabindex="0">${chip(x.sev, sevCls[x.sev])}<div class="grow"><b>#${x.id} ${e(x.type)}</b><span class="muted small">${e(x.city)} - ${fmtDur(Date.now() - x.at)} ago</span></div></div>`).join('') || '<div class="muted">No active incidents</div>'}</div></div>
      <div class="card"><h3>${ic('camera', 16)}Video management</h3>${dl([['Cameras online', d.cameras.filter((c) => c.status === 'online').length + ' of ' + d.cameras.length], ['Analytics events', String(d.vmsEvents.length)], ['Units available', d.units.filter((u) => u.status === 'available').length + ' of ' + d.units.length]])}<a class="btn sm" data-a="nav" data-id="vms" role="link" tabindex="0">Open VMS</a></div></div>`;
    return html + (ui.role === 'customer' ? '' : card);
  };

  /* Settings: Geoapify key */
  const oldSettings = V.settings;
  V.settings = function () {
    const k = geoKey(), masked = k ? k.slice(0, 4) + '...' + k.slice(-3) : '';
    return oldSettings() + `<div class="card" style="margin-top:14px;max-width:760px"><h3>${ic('map', 16)}Map provider (Geoapify)<span class="sp"></span>${chip(k ? (GM.failed ? 'library blocked' : 'key set') : 'not configured', k && !GM.failed ? 'ok' : '')}</h3>
      <p class="muted">The command centre can show live street maps from Geoapify. Create a free key at <a href="https://myprojects.geoapify.com/" target="_blank" rel="noopener" style="color:var(--brand)">myprojects.geoapify.com</a> and restrict it to your site's domain. The key is stored in this browser only${k ? ' (current: ' + e(masked) + ')' : ''}.</p>
      <form data-form="geoKey" class="row wrap"><input name="key" placeholder="Geoapify API key" autocomplete="off" spellcheck="false" style="flex:1;min-width:220px" aria-label="Geoapify API key"><button class="btn primary">Save key</button>${k ? '<button type="button" class="btn danger" data-a="geoClear">Remove</button>' : ''}</form></div>`;
  };
  const resetMap = () => { if (GM.map) { GM.map.remove(); GM.map = null; GM.el = null; } GM.failed = false; GM.focus = null; };
  FORMS.geoKey = (v) => { const k = (v.key || '').trim(); if (!/^[A-Za-z0-9]{16,64}$/.test(k)) { A.toast('That does not look like a Geoapify key', 'alert'); return; } try { localStorage.setItem('geoapify-key', k); } catch (_) { A.toast('Browser storage is blocked, the key will not persist', 'alert'); window.GEOAPIFY_KEY = k; } resetMap(); A.commit('Geoapify key saved'); A.toast('Key saved. Open the command centre to see the live map.', 'map'); };
  ACT.geoClear = () => { try { localStorage.removeItem('geoapify-key'); } catch (_) { /* ignore */ } window.GEOAPIFY_KEY = ''; resetMap(); A.commit('Geoapify key removed'); A.toast('Key removed'); };

  /* normalise seed incidents and keep the palette search aware of the new objects */
  D().incidents.forEach(sopFor);
})();
