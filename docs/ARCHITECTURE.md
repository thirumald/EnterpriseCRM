# Architecture notes

## Core modules

| Module | Owns | Key behaviours |
|---|---|---|
| CRM | accounts, contacts, sites, contracts, contract coverage, opportunities, activities | Account 360, health score (open P1/P2, SLA breaches, low CSAT, critical alerts), renewal-risk and warranty-renewal automation |
| Help Desk | tickets, ticket events, queues, KB | Multi-channel intake, routing by CI class, least-loaded assignment, merge, CSAT |
| SLA engine | policies, calendars, timers | Event-sourced timeline; timers store `remaining_min` on pause and recompute `due_at` on resume |
| CMDB | config items, relationships, lifecycle, warranties | Recursive-CTE impact analysis; identity reconciliation serial > MAC > hostname |
| IPAM | subnets, IPs | `cidr`/`inet` types, containment lookup, utilisation, conflict detection |
| Monitoring | checks, metrics, alerts, collectors, maintenance windows | Edge evaluation + hysteresis, dedupe by fingerprint, topology suppression |
| Automation | workflow rules and executions | Rules R1-R20 (R10 folded into R9), toggleable and parameterised |

## Contract → SLA resolution

1. Ticket has an explicit contract → use it.
2. Otherwise the contract **covering the ticket's CI** (`contract_covered_ci`), active today.
3. Otherwise the account's highest-value active contract (only when no CI is involved).
4. No contract → no SLA timers (alert on an uncovered asset becomes P4 + CRM opportunity, rule R4).

Policy targets are per priority: `{response, resolution, clock: '24x7' | 'business'}`. Business clocks use the policy's calendar
(UTC offset, weekly windows, holidays). `addBusinessMinutes` / `businessMinutesBetween` in `server/src/sla.ts` are pure functions.

## Monitoring mechanics: Sub DC vs Main DC

| Concern | Sub DC (`EdgeCollector`) | Main DC (`ingestBatch`, `collectorWatchdog`) |
|---|---|---|
| Polling | Full-resolution local polls of its site's checks | Never polls across the WAN |
| Thresholds | Evaluated locally; N consecutive samples (hysteresis) to open or clear | Receives only alert candidates (open/clear) |
| Aggregation | One batch per window: avg/min/max/p95/count per series | Stores aggregates in `metrics` |
| WAN down | Keeps polling and alerting, queues batches | Heartbeat gap → collector `STALE`, one incident, site CIs `UNKNOWN` (never `DOWN`) |
| Recovery | Replays queue in order | Idempotent by `(collector, seq)`; incident auto-resolved, CIs restored |
| Bandwidth | `raw_samples_total` vs `forwarded_points_total` is tracked per collector | Shown on the NOC dashboard as "WAN saved" |

## Alert → ticket → SLA pipeline

`raiseAlert` → (maintenance? suppress, R12) → (upstream CI DOWN? attach to root-cause ticket, R3) → (open ticket for CI? append, R5) →
(site storm? major incident, R3) → warning waits `persist_min` (R2) → critical: P1 for High/Critical CIs else P2 (R1) →
uncovered asset (R4) → create ticket + SLA timers → page/notify → runbook (R18).
Shared infrastructure (no owner) fans out one *[Impact]* child ticket per affected account, each under that account's own contract.
`closeAlert` auto-resolves the ticket when no agent has replied recently (R6), and a recurrence within 24 h reopens it.

## Database

`db/schema.sql` is the single source of truth (idempotent `CREATE ... IF NOT EXISTS`). `metrics` and `iot_telemetry` become hypertables when TimescaleDB is installed;
on plain PostgreSQL they remain ordinary tables and `pruneMetrics()` enforces retention. For production add continuous aggregates (1h/1d), compression and retention policies
and a migration tool in place of the apply-on-start approach.

## Known gaps / next steps

AuthN/Z + multi-tenant row-level security · real SNMP/WMI/SSH/agent and MQTT drivers · email/SMS/pager delivery · IMAP intake · DHCP/DNS sync · SLA credits ·
persistent (disk) collector queue · mTLS between collectors and the Main DC · message bus between services · .NET port of the services using this module split.
