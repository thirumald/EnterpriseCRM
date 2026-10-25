# Unified CRM + ITOM Platform

One application that joins **B2B CRM**, an **ITSM help desk with an SLA engine**, **CMDB / IPAM**, and **distributed infrastructure monitoring**
for estates spread across a Main DC and Sub/Edge DCs. A customer's contract, its covered hardware, the live monitoring alerts on that hardware,
and the tickets those alerts raise are all rows in one PostgreSQL schema, so the links never need syncing.

```
Sub DC (edge)                                    Main DC
┌─────────────────────────────┐   aggregated     ┌──────────────────────────────────────────┐
│ EdgeCollector               │   batches + seq  │ ingest ─► metrics (Timescale hypertable) │
│  poll SNMP/WMI/agent/TCP    │   (idempotent)   │   │                                      │
│  local thresholds+hysteresis│ ───────────────► │   └► alerts ─► correlation ─► workflow   │
│  1-window aggregation       │   store & fwd    │        ▲ topology / maintenance / dedupe │
│  store-and-forward queue     │                 │        └► tickets ─► SLA timers ─► escal. │
│ syslog UDP · MQTT/IoT push  │                  │ CRM ◄─ contracts ─ CMDB ─ IPAM           │
└─────────────────────────────┘                  └──────────────────────────────────────────┘
```

## Quick start

Requires Node 22+ and PostgreSQL 16+ (TimescaleDB optional - hypertables are enabled automatically if the extension exists).

```bash
createdb enterprisecrm
export DATABASE_URL=postgres://postgres@localhost:5432/enterprisecrm
npm install
npm run build          # type-checks both packages and builds the React app
npm start              # applies db/schema.sql, seeds demo data on first run, serves API + UI on :4000
# open http://localhost:4000
```

Dev mode: `npm run dev:server` and `npm run dev:web` (Vite on :5173 proxies `/api`). `docker compose up` is provided (TimescaleDB image) but was not run when this was authored.

Tests (need a scratch Postgres at `postgres://postgres@localhost:5433/enterprisecrm_test`, or set `DATABASE_URL`; the suite **drops and recreates all tables** in that database):

```bash
npm test               # 26 tests: SLA calendar math + the end-to-end alert→ticket→SLA pipeline against real PostgreSQL
```

## Try the whole loop (2 minutes)

1. **Infrastructure → Simulator**: pick `SW-A1` (shared core switch) → *Device down* → Inject.
2. Within a few seconds the Sub/Main-DC collector sees 3 failed polls, ships the alert, and the **NOC dashboard** shows it in the live feed and topology.
3. **Help Desk**: one P1 root-cause ticket for `SW-A1`, plus an *[Impact]* child ticket for **each** affected customer with that customer's own contract SLA (Platinum 15 min vs Gold 30 min). Downstream servers go `UNKNOWN`, not `DOWN`, and their alerts attach to the root cause instead of making noise.
4. Cut a Sub-DC WAN (Simulator): the collector keeps alerting locally and buffers; the site goes `UNKNOWN` with one collector incident; restore the WAN and the backlog replays in order.
5. Set a ticket to *Waiting on Customer* → SLA timers pause; a customer reply resumes them. Business-hours contracts (Silver) skip nights, weekends and holidays.
6. **CRM Accounts**: Account 360 shows contract, covered/uncovered assets, live alerts, SLA attainment and health score. An alert on an *uncovered* asset (e.g. `INITECH-POS-01`) opens a P4 plus a CRM upsell opportunity.

## What is implemented

| Area | Implemented | Notes / not implemented |
|---|---|---|
| CRM | Accounts (hierarchy), contacts, sites, contracts + covered assets, opportunities pipeline, activities, health score, renewal-risk and warranty-renewal automation | No quotes/invoicing |
| Help desk | Email intake (webhook endpoint, thread token, contact/domain → account), portal, REST API with idempotency keys, agent UI, queues, auto-assignment, merge, CSAT, KB suggestions | No live IMAP/SMTP, phone or chat connectors - they call the same intake functions |
| SLA engine | Contract→policy resolution, response/resolution timers, 24x7 or business-hours calendars (offset, holidays), pause/resume, priority change recompute, 75/90 % warnings, breach, L1/L2/L3 escalation, maintenance pause | Deterministic and unit tested; SLA credits not calculated |
| CMDB | CI classes, lifecycle with history, relationships, recursive impact analysis, warranty tracking, reconciliation (serial→MAC→hostname), Pending-Review workflow | Discovery results come from the API / a **simulated** scan; real ICMP/ARP/SNMP sweeps are not implemented |
| IPAM | Subnets, utilisation, IP assignment with conflict detection, reservations, IP-conflict incident | No DHCP/DNS sync |
| Monitoring | Edge collector with local thresholds + hysteresis, window aggregation, store-and-forward, idempotent ingest, heartbeats/collector-offline handling, syslog UDP listener, IoT/MQTT-style ingest + staleness, maintenance windows, dedupe, topology suppression, alert storms | Device reads are **simulated** (`server/src/sim.ts`) except an optional real TCP probe; **no real SNMP/WMI/SSH/agent drivers or MQTT broker client** - they plug in behind `readMetric`/`ingestIot` |
| Automation | 19 rules (R1-R20, see Administration → Workflow rules), toggleable with parameters, execution log | Notifications are *recorded*, not delivered (email/SMS/pager adapters not wired) |
| Frontend | NOC dashboard (site map, topology, live ticker, SLA board, top-N, collector fabric, IoT, wall mode), Help Desk, Infrastructure, CRM, Customer portal, Admin | |
| Security | - | **No authentication/authorization or tenant isolation yet**; the UI sends an `x-user` header for the audit trail only. Do not expose to a network as is |

## Mapping to the target architecture

This reference implementation is **TypeScript (Node 22, Express 5) + React 19 + PostgreSQL**, built as a modular monolith because the sandbox it was authored in has no .NET SDK.
Module boundaries mirror the intended .NET microservices; each file talks to others through exported functions and the in-process event bus in `server/src/events.ts`, the seam where Kafka/NATS goes.

| Target .NET service | Module here | Event seam |
|---|---|---|
| `helpdesk-service`, `intake-service` | `helpdesk.ts` | `ticket.*` |
| `sla-service` | `sla.ts` (pure math), `slaService.ts` | `sla.*` |
| `crm-service` | `routes.ts` (accounts/contracts/opps), `helpdesk.updateHealthScore` | `account.health` |
| `cmdb-service`, `ipam-service`, `discovery-service` | `cmdb.ts`, `discovery.ts` | `ci.*` |
| `collector-service` (edge) | `collector.ts` (+ `sim.ts` drivers) | `telemetry.batch` |
| `telemetry-ingest-service`, `event-correlation-service` | `monitoring.ts`, `alerts.ts` | `alert.*` |
| `workflow-service`, `notification-service` | `alerts.ts` (rules), `RULES` table | `workflow.executed` |
| `realtime-hub` | `events.ts` SSE (SignalR in the target) | - |

Details: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). Schema: [db/schema.sql](db/schema.sql).

## HTTP API (selected)

`POST /api/v1/tickets` (Idempotency-Key) · `POST /api/inbound/email` · `GET /api/tickets` · `GET /api/accounts/:id` (360°) · `GET /api/cis/:id/impact` · `GET /api/topology` ·
`POST /api/ingest/batch` (collector → Main DC) · `POST /api/ingest/iot` · `POST /api/ingest/syslog` (also UDP :5514) · `GET /api/dashboard/noc` · `GET /api/events` (SSE).
