'use strict';
/* Sample data for the static preview. Everything is generated relative to "now" so SLA clocks look alive. */
window.makeSeed = function () {
  const now = Date.now(), M = 60000, H = 3600000, D = 86400000;
  const ago = (min) => now - min * M;
  const day = (n) => new Date(now + n * D).toISOString().slice(0, 10);

  const sites = [
    { id: 's1', name: 'Tirana National DC', region: 'Tirana', collector: 'online', queue: 0, latency: 9, maintenance: false },
    { id: 's2', name: 'Durrës Edge DC', region: 'Durrës', collector: 'online', queue: 0, latency: 18, maintenance: false },
    { id: 's3', name: 'Vlorë Edge DC', region: 'Vlorë', collector: 'online', queue: 0, latency: 27, maintenance: false },
    { id: 's4', name: 'Shkodër Edge DC', region: 'Shkodër', collector: 'online', queue: 0, latency: 24, maintenance: false },
  ];

  const accounts = [
    { id: 'a1', name: 'Tirana Municipality', industry: 'Local government', tier: 'Gold', owner: 'Mira Hoxha', health: 62, arr: 420000, employees: 3100, city: 'Tirana' },
    { id: 'a2', name: 'National e-Government Agency', industry: 'Central government', tier: 'Gold', owner: 'Arben Leka', health: 88, arr: 360000, employees: 640, city: 'Tirana' },
    { id: 'a3', name: 'Durrës Port Authority', industry: 'Port & maritime', tier: 'Gold', owner: 'Arben Leka', health: 71, arr: 280000, employees: 920, city: 'Durrës' },
    { id: 'a4', name: 'Vlorë Municipality', industry: 'Local government', tier: 'Silver', owner: 'Mira Hoxha', health: 80, arr: 150000, employees: 540, city: 'Vlorë' },
    { id: 'a5', name: 'Shkodër Municipality', industry: 'Local government', tier: 'Silver', owner: 'Arben Leka', health: 90, arr: 130000, employees: 480, city: 'Shkodër' },
    { id: 'a6', name: 'Tirana Urban Mobility Agency', industry: 'Transport & mobility', tier: 'Bronze', owner: 'Mira Hoxha', health: 54, arr: 95000, employees: 260, city: 'Tirana' },
    { id: 'a7', name: 'Albania Smart Grid Operator', industry: 'Energy & utilities', tier: 'Silver', owner: 'Mira Hoxha', health: 77, arr: 175000, employees: 1350, city: 'Tirana' },
    { id: 'a8', name: 'Korçë Municipality', industry: 'Local government', tier: 'Bronze', owner: 'Arben Leka', health: 85, arr: 62000, employees: 300, city: 'Korçë' },
  ];

  const contacts = [
    { id: 'c1', account: 'a1', name: 'Anila Koci', title: 'Smart City Programme Director', email: 'anila@tirana-municipality.example', phone: '+355 4 555 0101', primary: true },
    { id: 'c2', account: 'a1', name: 'Dritan Mema', title: 'Head of Traffic Systems', email: 'dritan@tirana-municipality.example', phone: '+355 4 555 0144' },
    { id: 'c3', account: 'a2', name: 'Eriola Prifti', title: 'Director of Infrastructure', email: 'eriola@egov.example', phone: '+355 4 555 0192', primary: true },
    { id: 'c4', account: 'a3', name: 'Gentian Ndreu', title: 'Port IT Manager', email: 'gentian@durres-port.example', phone: '+355 52 555 0170', primary: true },
    { id: 'c5', account: 'a4', name: 'Sonila Gjika', title: 'Deputy Mayor, Innovation', email: 'sonila@vlore.example', phone: '+355 33 555 0133', primary: true },
    { id: 'c6', account: 'a4', name: 'Ilir Cela', title: 'Smart Lighting Lead', email: 'ilir@vlore.example', phone: '+355 33 555 0166' },
    { id: 'c7', account: 'a5', name: 'Marsela Pjetri', title: 'IT Coordinator', email: 'marsela@shkoder.example', phone: '+355 22 555 0129', primary: true },
    { id: 'c8', account: 'a6', name: 'Klajdi Bushi', title: 'Traffic Enforcement Systems', email: 'klajdi@mobility.example', phone: '+355 4 555 0188', primary: true },
    { id: 'c9', account: 'a7', name: 'Orgesa Dedja', title: 'Head of Metering Platforms', email: 'orgesa@smartgrid.example', phone: '+355 4 555 0152', primary: true },
    { id: 'c10', account: 'a8', name: 'Pandi Qirjazi', title: 'IT Manager', email: 'pandi@korce.example', phone: '+355 82 555 0114', primary: true },
  ];

  const assets = [
    { id: 'n1', name: 'fw-tia-core-01', type: 'Firewall', site: 's1', account: 'a2', status: 'In service', ip: '10.10.0.1', crit: 3, warranty: day(210), dep: [], m: { cpu: 31, mem: 44, disk: 22 } },
    { id: 'n2', name: 'core-sw-tia-01', type: 'Switch', site: 's1', account: 'a1', status: 'In service', ip: '10.10.0.2', crit: 3, warranty: day(45), dep: ['n1'], m: { cpu: 24, mem: 38, disk: 15 } },
    { id: 'n3', name: 'core-sw-tia-02', type: 'Switch', site: 's1', account: 'a2', status: 'In service', ip: '10.10.0.3', crit: 3, warranty: day(400), dep: ['n1'], m: { cpu: 27, mem: 41, disk: 18 } },
    { id: 'n4', name: 'san-tia-01', type: 'Storage', site: 's1', account: 'a1', status: 'In service', ip: '10.10.1.10', crit: 3, warranty: day(120), dep: ['n2'], m: { cpu: 44, mem: 62, disk: 71 } },
    { id: 'n5', name: 'db-gis-01', type: 'Database', site: 's1', account: 'a1', status: 'In service', ip: '10.10.1.20', crit: 3, warranty: day(300), dep: ['n2', 'n4'], m: { cpu: 58, mem: 79, disk: 91 } },
    { id: 'n6', name: 'vms-tia-01', type: 'Server', site: 's1', account: 'a1', status: 'In service', ip: '10.10.2.11', crit: 2, warranty: day(260), dep: ['n5', 'n2'], m: { cpu: 49, mem: 66, disk: 54 } },
    { id: 'n7', name: 'anpr-engine-01', type: 'Server', site: 's1', account: 'a6', status: 'In service', ip: '10.10.2.12', crit: 2, warranty: day(260), dep: ['n5', 'n2'], m: { cpu: 46, mem: 63, disk: 52 } },
    { id: 'n8', name: 'db-egov-01', type: 'Database', site: 's1', account: 'a2', status: 'In service', ip: '10.10.1.30', crit: 3, warranty: day(18), dep: ['n3'], m: { cpu: 52, mem: 71, disk: 67 } },
    { id: 'n9', name: 'app-egov-portal-01', type: 'Server', site: 's1', account: 'a2', status: 'In service', ip: '10.10.2.31', crit: 3, warranty: day(180), dep: ['n8', 'n3'], m: { cpu: 61, mem: 74, disk: 58 } },
    { id: 'n10', name: 'fw-dur-01', type: 'Firewall', site: 's2', account: 'a3', status: 'In service', ip: '10.20.0.1', crit: 3, warranty: day(500), dep: [], m: { cpu: 88, mem: 52, disk: 30 } },
    { id: 'n11', name: 'rtr-dur-01', type: 'Router', site: 's2', account: 'a3', status: 'In service', ip: '10.20.0.2', crit: 2, warranty: day(330), dep: ['n10'], m: { cpu: 36, mem: 40, disk: 20 } },
    { id: 'n12', name: 'app-port-tos-01', type: 'Server', site: 's2', account: 'a3', status: 'In service', ip: '10.20.2.10', crit: 3, warranty: day(90), dep: ['n11'], m: { cpu: 57, mem: 68, disk: 47 } },
    { id: 'n13', name: 'sw-vlo-01', type: 'Switch', site: 's3', account: 'a4', status: 'In service', ip: '10.30.0.2', crit: 2, warranty: day(150), dep: [], m: { cpu: 21, mem: 33, disk: 12 } },
    { id: 'n14', name: 'lora-gw-vlo-01', type: 'IoT gateway', site: 's3', account: 'a4', status: 'In service', ip: '10.30.5.10', crit: 1, warranty: day(600), dep: ['n13'], m: { cpu: 17, mem: 29, disk: 9 } },
    { id: 'n15', name: 'app-lighting-vlo-01', type: 'Server', site: 's3', account: 'a4', status: 'Maintenance', ip: '10.30.2.7', crit: 2, warranty: day(75), dep: ['n13'], m: { cpu: 12, mem: 25, disk: 40 } },
    { id: 'n16', name: 'rtr-shk-01', type: 'Router', site: 's4', account: 'a5', status: 'In service', ip: '10.40.0.1', crit: 2, warranty: day(220), dep: [], m: { cpu: 33, mem: 36, disk: 19 } },
    { id: 'n17', name: 'ami-head-end-shk-01', type: 'Server', site: 's4', account: 'a7', status: 'In service', ip: '10.40.2.5', crit: 3, warranty: day(140), dep: ['n16'], m: { cpu: 55, mem: 64, disk: 61 } },
    { id: 'n18', name: 'sensor-gw-kor-01', type: 'IoT gateway', site: 's3', account: 'a8', status: 'Staging', ip: '10.30.0.9', crit: 2, warranty: day(700), dep: [], m: { cpu: 8, mem: 18, disk: 7 } },
    { id: 'n19', name: 'app-waste-shk-01', type: 'Server', site: 's4', account: 'a5', status: 'In service', ip: '10.40.2.9', crit: 1, warranty: day(310), dep: ['n16'], m: { cpu: 28, mem: 44, disk: 35 } },
  ];

  const subnets = [
    { id: 'ip1', cidr: '10.10.0.0/24', name: 'Tirana core management', site: 's1', vlan: 10, base: 22, reserved: [] },
    { id: 'ip2', cidr: '10.10.1.0/24', name: 'Storage & city databases', site: 's1', vlan: 20, base: 61, reserved: [] },
    { id: 'ip3', cidr: '10.10.2.0/24', name: 'Smart-city applications', site: 's1', vlan: 30, base: 188, reserved: [] },
    { id: 'ip4', cidr: '10.20.0.0/22', name: 'Durrës port & edge', site: 's2', vlan: 40, base: 130, reserved: [] },
    { id: 'ip5', cidr: '10.30.0.0/21', name: 'Vlorë & Korçë IoT edge', site: 's3', vlan: 50, base: 540, reserved: [] },
    { id: 'ip6', cidr: '10.40.0.0/22', name: 'Shkodër edge', site: 's4', vlan: 60, base: 880, reserved: [] },
  ];

  const tk = (id, subject, account, pri, status, assignee, cat, asset, source, createdMin, extra) =>
    Object.assign({ id, subject, account, pri, status, assignee, cat, asset, source, created: ago(createdMin), firstResponse: null, resolvedAt: null, pausedAt: null, pausedMs: 0, csat: null, comments: [] }, extra || {});
  const tickets = [
    tk(1043, 'Core switch uplink down - city platform unreachable', 'a1', 'P1', 'In progress', 'Thirumal D', 'Network', 'n2', 'Alert', 70, { firstResponse: ago(62), comments: [{ by: 'System', at: ago(70), text: 'Created from critical alert: Interface Gi0/1 down.', internal: true }, { by: 'Thirumal D', at: ago(62), text: 'Investigating physical layer, suspect SFP failure.', internal: false }] }),
    tk(1042, 'ANPR cameras dropping events on the ring road', 'a6', 'P2', 'Open', null, 'Application', 'n7', 'Email', 130),
    tk(1041, 'GIS database volume almost full on db-gis-01', 'a1', 'P2', 'In progress', 'Thirumal D', 'Database', 'n5', 'Alert', 300, { firstResponse: ago(280), comments: [{ by: 'Thirumal D', at: ago(280), text: 'Capacity review started, archive job proposed.', internal: false }] }),
    tk(1040, 'Citizen portal API latency above 2 s', 'a2', 'P2', 'Pending', 'Besnik Shehu', 'Application', 'n9', 'Portal', 1100, { firstResponse: ago(1060), pausedAt: ago(500), comments: [{ by: 'Besnik Shehu', at: ago(500), text: 'Waiting for the agency to share the upstream trace.', internal: false }] }),
    tk(1039, 'Port terminal system unreachable from Durrës', 'a3', 'P1', 'Open', null, 'Network', 'n12', 'Phone', 22),
    tk(1038, 'Invoice billing address change', 'a3', 'P4', 'Resolved', 'Elira Kola', 'Billing', null, 'Email', 3000, { firstResponse: ago(2980), resolvedAt: ago(2700), csat: 5, comments: [{ by: 'Elira Kola', at: ago(2700), text: 'Address updated and confirmation sent.', internal: false }] }),
    tk(1037, 'New operator needs access to the traffic control dashboard', 'a5', 'P3', 'Resolved', 'Elira Kola', 'Access', null, 'Portal', 2000, { firstResponse: ago(1990), resolvedAt: ago(1900), csat: 4 }),
    tk(1036, 'LoRaWAN gateway intermittently offline in Vlorë', 'a4', 'P3', 'In progress', 'Besnik Shehu', 'Network', 'n14', 'Email', 600, { firstResponse: ago(570) }),
    tk(1035, 'Korçë sensor gateway staging checklist', 'a8', 'P4', 'Open', null, 'Server', 'n18', 'Portal', 4000),
    tk(1034, 'Quarterly firewall rule review', 'a2', 'P3', 'Closed', 'Besnik Shehu', 'Network', 'n1', 'API', 9000, { firstResponse: ago(8900), resolvedAt: ago(7000), csat: 5 }),
    tk(1033, 'Backup job failed for the video archive', 'a1', 'P3', 'Open', 'Thirumal D', 'Server', 'n6', 'Alert', 240, { firstResponse: ago(200) }),
    tk(1032, 'TLS certificate renewal for the citizen portal', 'a2', 'P3', 'Resolved', 'Elira Kola', 'Application', null, 'Email', 5200, { firstResponse: ago(5100), resolvedAt: ago(4700), csat: 2, comments: [{ by: 'Elira Kola', at: ago(4700), text: 'Certificate replaced; please confirm.', internal: false }] }),
  ];

  const alerts = [
    { id: 1, sev: 'critical', asset: 'n2', msg: 'Interface Gi0/1 down', source: 'syslog', at: ago(72), state: 'open', ticket: 1043 },
    { id: 2, sev: 'warning', asset: 'n10', msg: 'CPU above 85% for 10 min', source: 'threshold', at: ago(41), state: 'open', ticket: null },
    { id: 3, sev: 'warning', asset: 'n5', msg: 'Disk usage 91% (threshold 85%)', source: 'threshold', at: ago(305), state: 'ack', ticket: 1041 },
    { id: 4, sev: 'critical', asset: 'n12', msg: 'Heartbeat missed x3', source: 'heartbeat', at: ago(24), state: 'open', ticket: 1039 },
    { id: 5, sev: 'warning', asset: 'n8', msg: 'Warranty expires in 18 days', source: 'agent', at: ago(900), state: 'open', ticket: null },
    { id: 6, sev: 'info', asset: 'n15', msg: 'Maintenance window started', source: 'agent', at: ago(160), state: 'open', ticket: null },
    { id: 7, sev: 'warning', asset: 'n9', msg: 'Replication lag 4.2 s', source: 'threshold', at: ago(95), state: 'open', ticket: null },
    { id: 8, sev: 'info', asset: 'n13', msg: 'Heartbeat recovered', source: 'heartbeat', at: ago(600), state: 'resolved', ticket: null },
  ];

  const deals = [
    { id: 'd1', name: 'Tirana - Adaptive traffic control phase 2', account: 'a1', stage: 'Negotiation', value: 185000, prob: 70, owner: 'Mira Hoxha', close: day(21) },
    { id: 'd2', name: 'e-Government - Disaster recovery site', account: 'a2', stage: 'Proposal', value: 240000, prob: 50, owner: 'Arben Leka', close: day(40) },
    { id: 'd3', name: 'Durrës Port - Container tracking sensors', account: 'a3', stage: 'Qualified', value: 96000, prob: 30, owner: 'Arben Leka', close: day(55) },
    { id: 'd4', name: 'Vlorë - Smart street lighting rollout', account: 'a4', stage: 'Proposal', value: 140000, prob: 45, owner: 'Mira Hoxha', close: day(75) },
    { id: 'd5', name: 'Shkodër - Smart waste collection', account: 'a5', stage: 'Lead', value: 58000, prob: 15, owner: 'Arben Leka', close: day(90) },
    { id: 'd6', name: 'Mobility Agency - Public transport priority', account: 'a6', stage: 'Qualified', value: 72000, prob: 35, owner: 'Mira Hoxha', close: day(60) },
    { id: 'd7', name: 'Smart Grid - AMI head-end expansion', account: 'a7', stage: 'Won', value: 120000, prob: 100, owner: 'Mira Hoxha', close: day(-6) },
    { id: 'd8', name: 'Korçë - Environmental sensor network', account: 'a8', stage: 'Lead', value: 34000, prob: 10, owner: 'Arben Leka', close: day(110) },
    { id: 'd9', name: 'Tirana - Public Wi-Fi in city parks', account: 'a1', stage: 'Qualified', value: 110000, prob: 30, owner: 'Mira Hoxha', close: day(100) },
  ];

  const contracts = [
    { id: 'k1', account: 'a1', name: 'Smart city platform operations Gold', start: day(-300), end: day(65), value: 420000, sla: 'Gold', status: 'Active', renewal: 'Open' },
    { id: 'k2', account: 'a2', name: 'National e-government hosting Gold', start: day(-200), end: day(165), value: 360000, sla: 'Gold', status: 'Active', renewal: 'Open' },
    { id: 'k3', account: 'a3', name: 'Port operations connectivity Gold', start: day(-350), end: day(14), value: 280000, sla: 'Gold', status: 'Active', renewal: 'Negotiating' },
    { id: 'k4', account: 'a4', name: 'Coastal IoT edge Silver', start: day(-120), end: day(245), value: 150000, sla: 'Silver', status: 'Active', renewal: 'Open' },
    { id: 'k5', account: 'a5', name: 'Northern region edge Silver', start: day(-90), end: day(275), value: 130000, sla: 'Silver', status: 'Active', renewal: 'Open' },
    { id: 'k6', account: 'a6', name: 'Traffic enforcement hosting Bronze', start: day(-340), end: day(25), value: 95000, sla: 'Bronze', status: 'Active', renewal: 'At risk' },
    { id: 'k7', account: 'a7', name: 'Smart metering platform Silver', start: day(-60), end: day(305), value: 175000, sla: 'Silver', status: 'Active', renewal: 'Open' },
    { id: 'k8', account: 'a8', name: 'Environmental monitoring pilot Bronze', start: day(-400), end: day(-12), value: 62000, sla: 'Bronze', status: 'Expired', renewal: 'Lost contact' },
  ];

  const kb = [
    { id: 'kb1', title: 'Restoring a failed switch uplink (SFP replacement)', cat: 'Network', views: 412, helpful: 96, body: '1. Confirm link state with the NOC dashboard and the switch console.\n2. Check optical power levels on both ends.\n3. Swap the SFP with a spare from the site cage and re-check light levels.\n4. If the link stays down, fail over to the secondary uplink and open a hardware RMA.\n5. Record the replaced part in the CMDB and close the linked alert.' },
    { id: 'kb2', title: 'Database volume above 85%: safe clean-up steps', cat: 'Database', views: 288, helpful: 91, body: 'Never delete files from the data directory. Run the archive job, vacuum the largest tables during the maintenance window and request a volume extension when growth exceeds 5% per week. The GIS database grows fastest after new camera and sensor layers go live.' },
    { id: 'kb3', title: 'How SLA clocks pause and resume', cat: 'Service', views: 530, helpful: 88, body: 'The clock pauses when a ticket is set to Pending (waiting on the customer) and resumes on any customer reply. Gold contracts use the base targets, Silver x1.5, Bronze x2.' },
    { id: 'kb4', title: 'Requesting access to the customer portal', cat: 'Access', views: 305, helpful: 94, body: 'Ask your institution administrator to send an invite. Portal users only see their own organisation, never contract values or internal notes.' },
    { id: 'kb5', title: 'Planned maintenance windows and alert suppression', cat: 'Monitoring', views: 199, helpful: 90, body: 'Alerts for assets inside an active window are suppressed and tagged. Windows are set per site on the Monitoring page, for example while a municipality updates its street-lighting firmware.' },
    { id: 'kb6', title: 'VPN troubleshooting for municipal sites', cat: 'Network', views: 640, helpful: 83, body: 'Check IKE phase 1 and 2 lifetimes, confirm identical proposals on both peers and look for NAT keepalive mismatches before escalating.' },
    { id: 'kb7', title: 'Renewing TLS certificates for public portals', cat: 'Application', views: 221, helpful: 87, body: 'Generate a CSR on the target host, submit it to the CA, install the chain, reload the service and verify with an external scanner.' },
    { id: 'kb8', title: 'What happens when an edge DC link goes offline', cat: 'Monitoring', views: 143, helpful: 92, body: 'Edge collectors in Durrës, Vlorë and Shkodër keep polling and aggregating locally. Batches queue on disk with sequence numbers and are replayed idempotently when the link to Tirana returns.' },
    { id: 'kb9', title: 'LoRaWAN gateway offline: first checks', cat: 'IoT', views: 176, helpful: 89, body: '1. Confirm backhaul to the edge DC (ping the gateway management IP).\n2. Check PoE power on the switch port.\n3. Verify the gateway is still registered on the network server.\n4. Review antenna and surge protector on site if only some sensors are missing.' },
    { id: 'kb10', title: 'ANPR camera events delayed or missing', cat: 'Application', views: 154, helpful: 85, body: 'Check the camera gateway queue, then the ANPR engine CPU and the GIS database latency. Events are buffered at the edge for up to 24 hours, so a delay is usually a processing backlog rather than data loss.' },
  ];


  const cam = (id, name, city, type, analytics, status, res, site, ret, rec) => ({ id, name, city, type, analytics, status, res, site, retention: ret, rec: rec || 'continuous' });
  const cameras = [
    cam('c1', 'TIA-SKA-01 Skanderbeg Square', 'Tirana', 'PTZ', ['Crowd', 'Intrusion'], 'online', '4K', 's1', 30),
    cam('c2', 'TIA-RNG-02 Ring Road East', 'Tirana', 'ANPR', ['ANPR', 'Collision'], 'online', '1080p', 's1', 30),
    cam('c3', 'TIA-RNG-03 Ring Road West', 'Tirana', 'ANPR', ['ANPR'], 'degraded', '1080p', 's1', 30),
    cam('c4', 'TIA-BLV-04 Blloku Crossing', 'Tirana', 'Fixed', ['Crowd'], 'online', '1080p', 's1', 30),
    cam('c5', 'TIA-PRK-05 Grand Park Entrance', 'Tirana', 'Panoramic', ['Intrusion', 'Crowd'], 'online', '4K', 's1', 14, 'event'),
    cam('c6', 'TIA-STN-06 Central Bus Terminal', 'Tirana', 'Fixed', ['Crowd', 'Smoke'], 'online', '1080p', 's1', 30),
    cam('c16', 'TIA-HWY-07 Tirana-Durrës Highway', 'Tirana', 'ANPR', ['ANPR', 'Collision'], 'online', '1080p', 's1', 30),
    cam('c7', 'DUR-PRT-01 Port Gate A', 'Durrës', 'ANPR', ['ANPR'], 'online', '1080p', 's2', 60),
    cam('c8', 'DUR-PRT-02 Container Yard', 'Durrës', 'Thermal', ['Intrusion', 'Smoke'], 'online', '1080p', 's2', 60),
    cam('c9', 'DUR-BCH-03 Seafront Promenade', 'Durrës', 'PTZ', ['Crowd'], 'online', '4K', 's2', 14),
    cam('c10', 'VLO-SEA-01 Vlorë Waterfront', 'Vlorë', 'PTZ', ['Crowd'], 'offline', '4K', 's3', 14),
    cam('c11', 'VLO-IND-02 Independence Square', 'Vlorë', 'Fixed', ['Intrusion'], 'online', '1080p', 's3', 14),
    cam('c12', 'KOR-BZR-01 Old Bazaar', 'Korçë', 'Fixed', ['Crowd'], 'online', '1080p', 's3', 14),
    cam('c13', 'SHK-ROZ-01 Rozafa Road', 'Shkodër', 'ANPR', ['ANPR'], 'online', '1080p', 's4', 30),
    cam('c14', 'SHK-LAK-02 Lake Promenade', 'Shkodër', 'Panoramic', ['Crowd', 'Smoke'], 'online', '4K', 's4', 14),
    cam('c15', 'SHK-CTR-03 Pedestrian Centre', 'Shkodër', 'Fixed', ['Crowd'], 'online', '1080p', 's4', 14),
  ];
  const un = (id, name, kind, city, status) => ({ id, name, kind, city, status });
  const units = [
    un('u1', 'Police Patrol T-12', 'Police', 'Tirana', 'dispatched'), un('u2', 'Police Patrol D-04', 'Police', 'Durrës', 'available'),
    un('u3', 'Ambulance A-07', 'Ambulance', 'Tirana', 'dispatched'), un('u4', 'Ambulance V-02', 'Ambulance', 'Vlorë', 'available'),
    un('u5', 'Fire Engine D-01', 'Fire', 'Durrës', 'dispatched'), un('u6', 'Fire Engine T-03', 'Fire', 'Tirana', 'available'),
    un('u7', 'Municipal Crew S-05', 'Municipal crew', 'Shkodër', 'available'), un('u8', 'Lighting Crew V-01', 'Municipal crew', 'Vlorë', 'available'),
    un('u9', 'Traffic Unit T-09', 'Traffic', 'Tirana', 'available'), un('u10', 'Police Patrol S-02', 'Police', 'Shkodër', 'available'),
  ];
  const inc = (id, type, sev, city, location, camera, source, min, status, extra) => Object.assign({ id, type, sev, city, location, camera, source, at: ago(min), status, ackAt: null, units: [], ticket: null, sopDone: 0, timeline: [{ at: ago(min), by: 'System', text: 'Incident created from ' + source }] }, extra || {});
  const incidents = [
    inc(1001, 'ANPR watchlist hit', 'high', 'Tirana', 'Ring Road East, northbound', 'c2', 'VMS analytics', 6, 'new'),
    inc(1002, 'Crowd density above limit', 'medium', 'Tirana', 'Skanderbeg Square', 'c1', 'VMS analytics', 25, 'acknowledged', { ackAt: ago(22), sopDone: 2, timeline: [{ at: ago(25), by: 'System', text: 'Incident created from VMS analytics' }, { at: ago(22), by: 'Thirumal D', text: 'Acknowledged and monitoring on the video wall' }] }),
    inc(1003, 'Smoke detected', 'critical', 'Durrës', 'Container yard, row C', 'c8', 'VMS analytics', 12, 'dispatched', { ackAt: ago(11), units: ['u5'], sopDone: 2, timeline: [{ at: ago(12), by: 'System', text: 'Incident created from VMS analytics' }, { at: ago(11), by: 'Thirumal D', text: 'Acknowledged' }, { at: ago(10), by: 'Thirumal D', text: 'Dispatched Fire Engine D-01' }] }),
    inc(1004, 'Street light cluster fault', 'low', 'Vlorë', 'Vlorë seafront, 14 luminaires', null, 'IoT sensor', 70, 'new'),
    inc(1005, 'Traffic collision', 'high', 'Tirana', 'Tirana-Durrës highway km 8', 'c16', 'VMS analytics', 18, 'dispatched', { ackAt: ago(17), units: ['u1', 'u3'], sopDone: 3, timeline: [{ at: ago(18), by: 'System', text: 'Incident created from VMS analytics' }, { at: ago(17), by: 'Thirumal D', text: 'Acknowledged' }, { at: ago(15), by: 'Thirumal D', text: 'Dispatched Police Patrol T-12 and Ambulance A-07' }] }),
    inc(1006, 'Smart bin overflow', 'low', 'Shkodër', 'Pedestrian centre, bin cluster 3', null, 'IoT sensor', 300, 'resolved', { ackAt: ago(290), sopDone: 3, timeline: [{ at: ago(300), by: 'System', text: 'Incident created from IoT sensor' }, { at: ago(240), by: 'Thirumal D', text: 'Crew emptied the bins. Resolved.' }] }),
  ];
  const vmsEvents = [
    { at: ago(6), camera: 'c2', kind: 'ANPR', text: 'Watchlist plate matched (confidence 94%)', incident: 1001 },
    { at: ago(18), camera: 'c16', kind: 'Collision', text: 'Two-vehicle collision detected', incident: 1005 },
    { at: ago(25), camera: 'c1', kind: 'Crowd', text: 'Crowd density 5.2 persons per m2', incident: 1002 },
    { at: ago(12), camera: 'c8', kind: 'Smoke', text: 'Smoke plume detected (confidence 91%)', incident: 1003 },
    { at: ago(45), camera: 'c4', kind: 'Crowd', text: 'Crowd density 2.1 persons per m2', incident: null },
  ];
  const domains = [
    { id: 'traffic', name: 'Smart traffic', icon: 'activity', desc: 'Adaptive signals, ANPR and journey-time sensors', metric: 'Avg. journey time', value: '-14%', cities: { Tirana: [212, 4], Durrës: [64, 1], Vlorë: [38, 0], Shkodër: [41, 0] } },
    { id: 'lighting', name: 'Smart lighting', icon: 'sun', desc: 'Dimmable LED luminaires with fault reporting', metric: 'Energy saved', value: '-38%', cities: { Tirana: [4200, 52], Durrës: [980, 11], Vlorë: [1150, 28], Shkodër: [860, 6], Korçë: [420, 3] } },
    { id: 'waste', name: 'Smart waste', icon: 'trash', desc: 'Fill-level sensors and route optimisation', metric: 'Collections avoided', value: '22%', cities: { Tirana: [820, 9], Durrës: [210, 2], Shkodër: [190, 1] } },
    { id: 'environment', name: 'Environment', icon: 'globe', desc: 'Air quality, noise and weather stations', metric: 'PM2.5 city average', value: '14 ug/m3', cities: { Tirana: [64, 2], Durrës: [22, 0], Vlorë: [18, 1], Shkodër: [16, 0], Korçë: [12, 0] } },
    { id: 'parking', name: 'Smart parking', icon: 'mapPin', desc: 'In-ground bay sensors and guidance signs', metric: 'Search time', value: '-31%', cities: { Tirana: [1450, 18], Durrës: [320, 4] } },
    { id: 'wifi', name: 'Public Wi-Fi', icon: 'wifi', desc: 'City-wide access points with usage analytics', metric: 'Daily sessions', value: '48,200', cities: { Tirana: [310, 5], Durrës: [96, 1], Vlorë: [88, 2], Shkodër: [72, 0], Korçë: [40, 0] } },
    { id: 'metering', name: 'Smart metering', icon: 'zap', desc: 'AMI meters and grid edge sensors', metric: 'Meters reporting', value: '98.6%', cities: { Tirana: [26000, 240], Durrës: [7400, 70], Shkodër: [5200, 38] } },
    { id: 'safety', name: 'Public safety', icon: 'camera', desc: 'Video analytics and sensors feeding the command centre', metric: 'Incidents handled today', value: '37', cities: { Tirana: [7, 1], Durrës: [3, 0], Vlorë: [2, 1], Shkodër: [3, 0], Korçë: [1, 0] } },
  ];

  const rules = [
    ['R1', 'Critical alert creates a P1 ticket', 'Alerts', 'Opens a P1 ticket automatically and links the alert, asset and account.', true, true],
    ['R2', 'Persistent warning creates a P3 ticket', 'Alerts', 'A warning that stays open for 15 minutes creates a P3 ticket.', true, false],
    ['R3', 'Duplicate alert suppression', 'Alerts', 'Repeats of the same asset and message inside 10 minutes only bump a counter.', true, true],
    ['R4', 'Topology correlation', 'Alerts', 'Suppresses downstream alerts when an upstream dependency already has a critical alert.', true, true],
    ['R5', 'Maintenance window suppression', 'Alerts', 'Alerts from sites in maintenance are logged but not escalated.', true, true],
    ['R6', 'Missed heartbeat raises collector alert', 'Monitoring', 'Three missed heartbeats mark a collector offline and raise a critical alert.', true, false],
    ['R7', 'SLA 75% warning', 'SLA', 'Notifies the assignee when 75% of the resolution target is used.', true, false],
    ['R8', 'SLA breach escalates to L2', 'SLA', 'Escalates a breached ticket to second line and notifies the duty manager.', true, false],
    ['R9', 'L2 unresolved after 2 h escalates to L3', 'SLA', 'Adds the engineering on-call to the ticket.', false, false],
    ['R10', 'Pending customer for 3 days sends reminder', 'Service', 'Sends a reminder, then auto-closes after 7 days.', true, false],
    ['R11', 'Resolved ticket sends CSAT survey', 'Service', 'Emails a one-click satisfaction survey.', true, false],
    ['R12', 'Low CSAT notifies account manager', 'CRM', 'CSAT of 2 or lower alerts the account owner and lowers account health.', true, false],
    ['R13', 'Auto-assign by category skill', 'Service', 'Routes new tickets to the agent with the matching skill and lowest load.', true, false],
    ['R14', 'Contract renewal risk', 'CRM', 'Contracts ending within 90 days with health under 70 raise a task for the account manager.', true, false],
    ['R15', 'Warranty expiry task', 'CMDB', 'Creates a task 60 days before warranty end.', true, false],
    ['R16', 'Unknown device goes to CMDB staging', 'CMDB', 'Discovery results that match no CI create a staging record for review.', true, false],
    ['R17', 'IP conflict raises ticket', 'IPAM', 'Two assets claiming one address raise a ticket to the network team.', true, false],
    ['R18', 'Subnet utilisation above 85%', 'IPAM', 'Alerts capacity planning before a subnet runs out.', true, false],
    ['R19', 'Gold account priority bump', 'Service', 'New tickets from Gold accounts are raised one priority level (max P1).', false, true],
    ['R20', 'Inbound email creates and threads tickets', 'Service', 'Creates a ticket or appends a reply by matching the reference in the subject.', true, false],
    ['R21', 'Analytics event opens a PSIM incident', 'Smart city', 'Camera analytics and IoT thresholds open an incident in the command centre with the matching SOP.', true, true],
    ['R22', 'Infrastructure incident raises a help desk ticket', 'Smart city', 'Street-light, waste and sensor faults also create a ticket so field crews are tracked in the ITSM.', true, true],
  ].map((r) => ({ id: r[0], name: r[1], cat: r[2], desc: r[3], enabled: r[4], live: r[5], hits: r[4] ? 10 + Math.floor(Math.random() * 90) : 0 }));

  const users = [
    { id: 'u1', name: 'Thirumal D', email: 'thirumal@example.com', role: 'admin', status: 'Active', last: ago(5) },
    { id: 'u2', name: 'Elira Kola', email: 'elira.kola@example.com', role: 'agent', status: 'Active', last: ago(30) },
    { id: 'u3', name: 'Besnik Shehu', email: 'besnik.shehu@example.com', role: 'engineer', status: 'Active', last: ago(12) },
    { id: 'u4', name: 'Mira Hoxha', email: 'mira.hoxha@example.com', role: 'account_manager', status: 'Active', last: ago(180) },
    { id: 'u5', name: 'Genti Dervishi', email: 'genti.dervishi@example.com', role: 'noc', status: 'Active', last: ago(2) },
    { id: 'u6', name: 'Anila Koci', email: 'anila@tirana-municipality.example', role: 'customer', status: 'Active', last: ago(1400) },
    { id: 'u7', name: 'Arben Leka', email: 'arben.leka@example.com', role: 'account_manager', status: 'Active', last: ago(240) },
    { id: 'u8', name: 'Former Contractor', email: 'contractor@example.com', role: 'engineer', status: 'Disabled', last: ago(60000) },
  ];

  const audit = [
    { at: ago(5), who: 'Ardit Basha', what: 'Signed in', target: 'session' },
    { at: ago(62), who: 'Besnik Shehu', what: 'First response', target: 'Ticket #1043' },
    { at: ago(70), who: 'System', what: 'Rule R1 created ticket', target: 'Ticket #1043' },
    { at: ago(300), who: 'System', what: 'Rule R2 created ticket', target: 'Ticket #1041' },
  ];

  return {
    now, sites, accounts, contacts, assets, subnets, tickets, alerts, deals, contracts, kb, rules, users, audit, cameras, units, incidents, vmsEvents, domains,
    volume: [14, 18, 12, 21, 17, 9, 7, 16, 22, 19, 15, 24, 18, 12],
    seq: { ticket: 1044, alert: 9, deal: 10, account: 9, asset: 19, user: 9, contact: 11, contract: 9, incident: 1007 },
  };
};
