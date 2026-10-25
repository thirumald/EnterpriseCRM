'use strict';
/* Sample data for the static preview. Everything is generated relative to "now" so SLA clocks look alive. */
window.makeSeed = function () {
  const now = Date.now(), M = 60000, H = 3600000, D = 86400000;
  const ago = (min) => now - min * M;
  const day = (n) => new Date(now + n * D).toISOString().slice(0, 10);

  const sites = [
    { id: 's1', name: 'Main DC', region: 'Frankfurt', collector: 'online', queue: 0, latency: 12, maintenance: false },
    { id: 's2', name: 'Edge DC West', region: 'Dublin', collector: 'online', queue: 0, latency: 28, maintenance: false },
    { id: 's3', name: 'Edge DC East', region: 'Warsaw', collector: 'online', queue: 0, latency: 34, maintenance: false },
    { id: 's4', name: 'Edge DC South', region: 'Madrid', collector: 'online', queue: 0, latency: 41, maintenance: false },
  ];

  const accounts = [
    { id: 'a1', name: 'Acme Corp', industry: 'Manufacturing', tier: 'Gold', owner: 'Mia Morgan', health: 62, arr: 240000, employees: 4200, city: 'Stuttgart' },
    { id: 'a2', name: 'Globex Financial', industry: 'Finance', tier: 'Gold', owner: 'Mia Morgan', health: 88, arr: 180000, employees: 1900, city: 'Dublin' },
    { id: 'a3', name: 'Initech Software', industry: 'Software', tier: 'Silver', owner: 'Sam Ortega', health: 95, arr: 60000, employees: 350, city: 'Warsaw' },
    { id: 'a4', name: 'Umbrella Health', industry: 'Healthcare', tier: 'Gold', owner: 'Sam Ortega', health: 71, arr: 310000, employees: 8800, city: 'Munich' },
    { id: 'a5', name: 'Stark Logistics', industry: 'Logistics', tier: 'Silver', owner: 'Mia Morgan', health: 80, arr: 95000, employees: 2100, city: 'Madrid' },
    { id: 'a6', name: 'Wayne Retail', industry: 'Retail', tier: 'Bronze', owner: 'Sam Ortega', health: 54, arr: 42000, employees: 760, city: 'Valencia' },
    { id: 'a7', name: 'Hooli Media', industry: 'Media', tier: 'Silver', owner: 'Mia Morgan', health: 90, arr: 70000, employees: 540, city: 'Berlin' },
    { id: 'a8', name: 'Soylent Foods', industry: 'Food & Beverage', tier: 'Bronze', owner: 'Sam Ortega', health: 77, arr: 38000, employees: 980, city: 'Lyon' },
  ];

  const contacts = [
    { id: 'c1', account: 'a1', name: 'Wendy Albrecht', title: 'IT Director', email: 'wendy@acme.example', phone: '+49 711 555 0101', primary: true },
    { id: 'c2', account: 'a1', name: 'Karl Vogt', title: 'Plant Systems Lead', email: 'karl@acme.example', phone: '+49 711 555 0144' },
    { id: 'c3', account: 'a2', name: 'Priya Nair', title: 'Head of Infrastructure', email: 'priya@globex.example', phone: '+353 1 555 0192', primary: true },
    { id: 'c4', account: 'a3', name: 'Tomasz Kowal', title: 'CTO', email: 'tomasz@initech.example', phone: '+48 22 555 0170', primary: true },
    { id: 'c5', account: 'a4', name: 'Dr. Eva Lindner', title: 'CIO', email: 'eva@umbrella.example', phone: '+49 89 555 0133', primary: true },
    { id: 'c6', account: 'a4', name: 'Jonas Weber', title: 'EHR Platform Owner', email: 'jonas@umbrella.example', phone: '+49 89 555 0166' },
    { id: 'c7', account: 'a5', name: 'Lucia Ferrer', title: 'Operations Manager', email: 'lucia@stark.example', phone: '+34 91 555 0129', primary: true },
    { id: 'c8', account: 'a6', name: 'Marco Ruiz', title: 'Store Systems', email: 'marco@wayne.example', phone: '+34 96 555 0188', primary: true },
    { id: 'c9', account: 'a7', name: 'Hannah Brandt', title: 'Head of IT', email: 'hannah@hooli.example', phone: '+49 30 555 0152', primary: true },
    { id: 'c10', account: 'a8', name: 'Louis Martin', title: 'IT Manager', email: 'louis@soylent.example', phone: '+33 4 555 0114', primary: true },
  ];

  const assets = [
    { id: 'n1', name: 'fw-main-01', type: 'Firewall', site: 's1', account: 'a1', status: 'In service', ip: '10.10.0.1', crit: 3, warranty: day(210), dep: [], m: { cpu: 31, mem: 44, disk: 22 } },
    { id: 'n2', name: 'core-sw-01', type: 'Switch', site: 's1', account: 'a1', status: 'In service', ip: '10.10.0.2', crit: 3, warranty: day(45), dep: ['n1'], m: { cpu: 24, mem: 38, disk: 15 } },
    { id: 'n3', name: 'core-sw-02', type: 'Switch', site: 's1', account: 'a4', status: 'In service', ip: '10.10.0.3', crit: 3, warranty: day(400), dep: ['n1'], m: { cpu: 27, mem: 41, disk: 18 } },
    { id: 'n4', name: 'san-01', type: 'Storage', site: 's1', account: 'a1', status: 'In service', ip: '10.10.1.10', crit: 3, warranty: day(120), dep: ['n2'], m: { cpu: 44, mem: 62, disk: 71 } },
    { id: 'n5', name: 'db-prod-03', type: 'Database', site: 's1', account: 'a1', status: 'In service', ip: '10.10.1.20', crit: 3, warranty: day(300), dep: ['n2', 'n4'], m: { cpu: 58, mem: 79, disk: 91 } },
    { id: 'n6', name: 'app-erp-01', type: 'Server', site: 's1', account: 'a1', status: 'In service', ip: '10.10.2.11', crit: 2, warranty: day(260), dep: ['n5', 'n2'], m: { cpu: 49, mem: 66, disk: 54 } },
    { id: 'n7', name: 'app-erp-02', type: 'Server', site: 's1', account: 'a1', status: 'In service', ip: '10.10.2.12', crit: 2, warranty: day(260), dep: ['n5', 'n2'], m: { cpu: 46, mem: 63, disk: 52 } },
    { id: 'n8', name: 'db-hl7-01', type: 'Database', site: 's1', account: 'a4', status: 'In service', ip: '10.10.1.30', crit: 3, warranty: day(18), dep: ['n3'], m: { cpu: 52, mem: 71, disk: 67 } },
    { id: 'n9', name: 'app-ehr-01', type: 'Server', site: 's1', account: 'a4', status: 'In service', ip: '10.10.2.31', crit: 3, warranty: day(180), dep: ['n8', 'n3'], m: { cpu: 61, mem: 74, disk: 58 } },
    { id: 'n10', name: 'fw-west-02', type: 'Firewall', site: 's2', account: 'a2', status: 'In service', ip: '10.20.0.1', crit: 3, warranty: day(500), dep: [], m: { cpu: 88, mem: 52, disk: 30 } },
    { id: 'n11', name: 'rtr-west-01', type: 'Router', site: 's2', account: 'a2', status: 'In service', ip: '10.20.0.2', crit: 2, warranty: day(330), dep: ['n10'], m: { cpu: 36, mem: 40, disk: 20 } },
    { id: 'n12', name: 'app-trade-01', type: 'Server', site: 's2', account: 'a2', status: 'In service', ip: '10.20.2.10', crit: 3, warranty: day(90), dep: ['n11'], m: { cpu: 57, mem: 68, disk: 47 } },
    { id: 'n13', name: 'sw-east-01', type: 'Switch', site: 's3', account: 'a3', status: 'In service', ip: '10.30.0.2', crit: 2, warranty: day(150), dep: [], m: { cpu: 21, mem: 33, disk: 12 } },
    { id: 'n14', name: 'ap-east-01', type: 'Access point', site: 's3', account: 'a3', status: 'In service', ip: '10.30.5.10', crit: 1, warranty: day(600), dep: ['n13'], m: { cpu: 17, mem: 29, disk: 9 } },
    { id: 'n15', name: 'app-07', type: 'Server', site: 's3', account: 'a3', status: 'Maintenance', ip: '10.30.2.7', crit: 2, warranty: day(75), dep: ['n13'], m: { cpu: 12, mem: 25, disk: 40 } },
    { id: 'n16', name: 'wh-gw-01', type: 'Router', site: 's4', account: 'a5', status: 'In service', ip: '10.40.0.1', crit: 2, warranty: day(220), dep: [], m: { cpu: 33, mem: 36, disk: 19 } },
    { id: 'n17', name: 'wms-01', type: 'Server', site: 's4', account: 'a5', status: 'In service', ip: '10.40.2.5', crit: 3, warranty: day(140), dep: ['n16'], m: { cpu: 55, mem: 64, disk: 61 } },
    { id: 'n18', name: 'pos-gw-01', type: 'Router', site: 's4', account: 'a6', status: 'Staging', ip: '10.40.0.9', crit: 2, warranty: day(700), dep: [], m: { cpu: 8, mem: 18, disk: 7 } },
  ];

  const subnets = [
    { id: 'ip1', cidr: '10.10.0.0/24', name: 'DC management', site: 's1', vlan: 10, base: 22, reserved: [] },
    { id: 'ip2', cidr: '10.10.1.0/24', name: 'Storage & databases', site: 's1', vlan: 20, base: 61, reserved: [] },
    { id: 'ip3', cidr: '10.10.2.0/24', name: 'Application servers', site: 's1', vlan: 30, base: 188, reserved: [] },
    { id: 'ip4', cidr: '10.20.0.0/22', name: 'West edge', site: 's2', vlan: 40, base: 130, reserved: [] },
    { id: 'ip5', cidr: '10.30.0.0/21', name: 'East edge', site: 's3', vlan: 50, base: 540, reserved: [] },
    { id: 'ip6', cidr: '10.40.0.0/22', name: 'South edge', site: 's4', vlan: 60, base: 880, reserved: [] },
  ];

  const tk = (id, subject, account, pri, status, assignee, cat, asset, source, createdMin, extra) =>
    Object.assign({ id, subject, account, pri, status, assignee, cat, asset, source, created: ago(createdMin), firstResponse: null, resolvedAt: null, pausedAt: null, pausedMs: 0, csat: null, comments: [] }, extra || {});
  const tickets = [
    tk(1043, 'Core switch uplink down - ERP unreachable', 'a1', 'P1', 'In progress', 'Nina Network', 'Network', 'n2', 'Alert', 70, { firstResponse: ago(62), comments: [{ by: 'System', at: ago(70), text: 'Created from critical alert: Interface Gi0/1 down.', internal: true }, { by: 'Nina Network', at: ago(62), text: 'Investigating physical layer, suspect SFP failure.', internal: false }] }),
    tk(1042, 'VPN drops every hour for remote plants', 'a1', 'P2', 'Open', null, 'Network', 'n1', 'Email', 130),
    tk(1041, 'Database disk almost full on db-prod-03', 'a1', 'P2', 'In progress', 'Alice Agent', 'Database', 'n5', 'Alert', 300, { firstResponse: ago(280), comments: [{ by: 'Alice Agent', at: ago(280), text: 'Capacity review started, archive job proposed.', internal: false }] }),
    tk(1040, 'HL7 interface latency above 2 s', 'a4', 'P2', 'Pending', 'Nina Network', 'Application', 'n9', 'Portal', 1100, { firstResponse: ago(1060), pausedAt: ago(500), comments: [{ by: 'Nina Network', at: ago(500), text: 'Waiting for vendor trace from Umbrella.', internal: false }] }),
    tk(1039, 'Cannot reach trading portal from Dublin office', 'a2', 'P1', 'Open', null, 'Network', 'n12', 'Phone', 22),
    tk(1038, 'Invoice billing address change', 'a2', 'P4', 'Resolved', 'Alice Agent', 'Billing', null, 'Email', 3000, { firstResponse: ago(2980), resolvedAt: ago(2700), csat: 5, comments: [{ by: 'Alice Agent', at: ago(2700), text: 'Address updated and confirmation sent.', internal: false }] }),
    tk(1037, 'New joiner needs access to monitoring portal', 'a3', 'P3', 'Resolved', 'Alice Agent', 'Access', null, 'Portal', 2000, { firstResponse: ago(1990), resolvedAt: ago(1900), csat: 4 }),
    tk(1036, 'Warehouse scanner gateway intermittently offline', 'a5', 'P3', 'In progress', 'Nina Network', 'Network', 'n16', 'Email', 600, { firstResponse: ago(570) }),
    tk(1035, 'POS gateway staging checklist', 'a6', 'P4', 'Open', null, 'Server', 'n18', 'Portal', 4000),
    tk(1034, 'Quarterly firewall rule review', 'a2', 'P3', 'Closed', 'Nina Network', 'Network', 'n10', 'API', 9000, { firstResponse: ago(8900), resolvedAt: ago(7000), csat: 5 }),
    tk(1033, 'Backup job failed for app-erp-02', 'a1', 'P3', 'Open', 'Alice Agent', 'Server', 'n7', 'Alert', 240, { firstResponse: ago(200) }),
    tk(1032, 'SSL certificate renewal for portal', 'a7', 'P3', 'Resolved', 'Alice Agent', 'Application', null, 'Email', 5200, { firstResponse: ago(5100), resolvedAt: ago(4700), csat: 2, comments: [{ by: 'Alice Agent', at: ago(4700), text: 'Certificate replaced; please confirm.', internal: false }] }),
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
    { id: 'd1', name: 'Acme - ERP hosting expansion', account: 'a1', stage: 'Negotiation', value: 85000, prob: 70, owner: 'Mia Morgan', close: day(21) },
    { id: 'd2', name: 'Globex - Managed firewall refresh', account: 'a2', stage: 'Proposal', value: 62000, prob: 50, owner: 'Mia Morgan', close: day(40) },
    { id: 'd3', name: 'Initech - Monitoring add-on', account: 'a3', stage: 'Qualified', value: 18000, prob: 30, owner: 'Sam Ortega', close: day(55) },
    { id: 'd4', name: 'Umbrella - DR site build', account: 'a4', stage: 'Proposal', value: 240000, prob: 45, owner: 'Sam Ortega', close: day(75) },
    { id: 'd5', name: 'Stark - WMS edge cluster', account: 'a5', stage: 'Lead', value: 48000, prob: 15, owner: 'Mia Morgan', close: day(90) },
    { id: 'd6', name: 'Wayne - POS network rollout', account: 'a6', stage: 'Qualified', value: 36000, prob: 35, owner: 'Sam Ortega', close: day(60) },
    { id: 'd7', name: 'Hooli - CDN peering', account: 'a7', stage: 'Won', value: 54000, prob: 100, owner: 'Mia Morgan', close: day(-6) },
    { id: 'd8', name: 'Soylent - Plant WAN', account: 'a8', stage: 'Lead', value: 22000, prob: 10, owner: 'Sam Ortega', close: day(110) },
    { id: 'd9', name: 'Acme - Managed SOC', account: 'a1', stage: 'Qualified', value: 120000, prob: 30, owner: 'Mia Morgan', close: day(100) },
  ];

  const contracts = [
    { id: 'k1', account: 'a1', name: 'Managed infrastructure Gold', start: day(-300), end: day(65), value: 240000, sla: 'Gold', status: 'Active', renewal: 'Open' },
    { id: 'k2', account: 'a2', name: 'Network operations Gold', start: day(-200), end: day(165), value: 180000, sla: 'Gold', status: 'Active', renewal: 'Open' },
    { id: 'k3', account: 'a3', name: 'Monitoring Silver', start: day(-120), end: day(245), value: 60000, sla: 'Silver', status: 'Active', renewal: 'Open' },
    { id: 'k4', account: 'a4', name: 'Clinical systems Gold', start: day(-350), end: day(14), value: 310000, sla: 'Gold', status: 'Active', renewal: 'Negotiating' },
    { id: 'k5', account: 'a5', name: 'Logistics edge Silver', start: day(-90), end: day(275), value: 95000, sla: 'Silver', status: 'Active', renewal: 'Open' },
    { id: 'k6', account: 'a6', name: 'Retail connectivity Bronze', start: day(-340), end: day(25), value: 42000, sla: 'Bronze', status: 'Active', renewal: 'At risk' },
    { id: 'k7', account: 'a7', name: 'Media delivery Silver', start: day(-60), end: day(305), value: 70000, sla: 'Silver', status: 'Active', renewal: 'Open' },
    { id: 'k8', account: 'a8', name: 'Plant WAN Bronze', start: day(-400), end: day(-12), value: 38000, sla: 'Bronze', status: 'Expired', renewal: 'Lost contact' },
  ];

  const kb = [
    { id: 'kb1', title: 'Restoring a failed switch uplink (SFP replacement)', cat: 'Network', views: 412, helpful: 96, body: '1. Confirm link state with the NOC dashboard and the switch console.\n2. Check optical power levels on both ends.\n3. Swap the SFP with a spare from the site cage and re-check light levels.\n4. If the link stays down, fail over to the secondary uplink and open a hardware RMA.\n5. Record the replaced part in the CMDB and close the linked alert.' },
    { id: 'kb2', title: 'Database volume above 85%: safe clean-up steps', cat: 'Database', views: 288, helpful: 91, body: 'Never delete files from the data directory. Run the archive job, vacuum the largest tables during the maintenance window and request a volume extension when growth exceeds 5% per week.' },
    { id: 'kb3', title: 'How SLA clocks pause and resume', cat: 'Service', views: 530, helpful: 88, body: 'The clock pauses when a ticket is set to Pending (waiting on the customer) and resumes on any customer reply. Gold contracts use the base targets, Silver x1.5, Bronze x2.' },
    { id: 'kb4', title: 'Requesting access to the customer portal', cat: 'Access', views: 305, helpful: 94, body: 'Ask your account administrator to send an invite. Portal users only see their own organisation, never contract values or internal notes.' },
    { id: 'kb5', title: 'Planned maintenance windows and alert suppression', cat: 'Monitoring', views: 199, helpful: 90, body: 'Alerts for assets inside an active window are suppressed and tagged. Windows are set per site on the Monitoring page.' },
    { id: 'kb6', title: 'VPN troubleshooting for remote plants', cat: 'Network', views: 640, helpful: 83, body: 'Check IKE phase 1 and 2 lifetimes, confirm identical proposals on both peers and look for NAT keepalive mismatches before escalating.' },
    { id: 'kb7', title: 'Renewing TLS certificates', cat: 'Application', views: 221, helpful: 87, body: 'Generate a CSR on the target host, submit it to the CA, install the chain, reload the service and verify with an external scanner.' },
    { id: 'kb8', title: 'What happens when a collector goes offline', cat: 'Monitoring', views: 143, helpful: 92, body: 'Edge collectors keep polling and aggregating locally. Batches queue on disk with sequence numbers and are replayed idempotently when the link returns.' },
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
  ].map((r) => ({ id: r[0], name: r[1], cat: r[2], desc: r[3], enabled: r[4], live: r[5], hits: r[4] ? 10 + Math.floor(Math.random() * 90) : 0 }));

  const users = [
    { id: 'u1', name: 'Dana Admin', email: 'admin@example.com', role: 'admin', status: 'Active', last: ago(5) },
    { id: 'u2', name: 'Alice Agent', email: 'alice.agent@example.com', role: 'agent', status: 'Active', last: ago(30) },
    { id: 'u3', name: 'Nina Network', email: 'nina.network@example.com', role: 'engineer', status: 'Active', last: ago(12) },
    { id: 'u4', name: 'Mia Morgan', email: 'mia.manager@example.com', role: 'account_manager', status: 'Active', last: ago(180) },
    { id: 'u5', name: 'Noah NOC', email: 'noc.operator@example.com', role: 'noc', status: 'Active', last: ago(2) },
    { id: 'u6', name: 'Wendy Albrecht', email: 'wendy@acme.example', role: 'customer', status: 'Active', last: ago(1400) },
    { id: 'u7', name: 'Sam Ortega', email: 'sam.ortega@example.com', role: 'account_manager', status: 'Active', last: ago(240) },
    { id: 'u8', name: 'Former Contractor', email: 'contractor@example.com', role: 'engineer', status: 'Disabled', last: ago(60000) },
  ];

  const audit = [
    { at: ago(5), who: 'Dana Admin', what: 'Signed in', target: 'session' },
    { at: ago(62), who: 'Nina Network', what: 'First response', target: 'Ticket #1043' },
    { at: ago(70), who: 'System', what: 'Rule R1 created ticket', target: 'Ticket #1043' },
    { at: ago(300), who: 'System', what: 'Rule R2 created ticket', target: 'Ticket #1041' },
  ];

  return {
    now, sites, accounts, contacts, assets, subnets, tickets, alerts, deals, contracts, kb, rules, users, audit,
    volume: [14, 18, 12, 21, 17, 9, 7, 16, 22, 19, 15, 24, 18, 12],
    seq: { ticket: 1044, alert: 9, deal: 10, account: 9, asset: 19, user: 9, contact: 11, contract: 9 },
  };
};
