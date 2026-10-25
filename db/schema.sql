-- Unified CRM + ITOM schema (PostgreSQL 16; TimescaleDB optional)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS business_calendars (
  id serial PRIMARY KEY, name text NOT NULL, utc_offset_min int NOT NULL DEFAULT 0,
  hours jsonb NOT NULL,            -- {"0":null,"1":[540,1020],...} minutes-of-day per weekday (0=Sun)
  holidays text[] NOT NULL DEFAULT '{}'
);
CREATE TABLE IF NOT EXISTS sla_policies (
  id serial PRIMARY KEY, name text NOT NULL, tier text NOT NULL,
  calendar_id int REFERENCES business_calendars(id),
  targets jsonb NOT NULL,          -- {"P1":{"response":15,"resolution":240,"clock":"24x7"},...} minutes
  escalation jsonb NOT NULL DEFAULT '{"warn":[75,90],"l2_after_min":30,"l3_after_min":120}'
);
CREATE TABLE IF NOT EXISTS accounts (
  id serial PRIMARY KEY, parent_id int REFERENCES accounts(id), name text NOT NULL UNIQUE,
  tier text NOT NULL DEFAULT 'Silver', industry text, owner text, email_domain text,
  health_score int NOT NULL DEFAULT 100, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS contacts (
  id serial PRIMARY KEY, account_id int NOT NULL REFERENCES accounts(id), name text NOT NULL,
  email text NOT NULL, phone text, role text, portal_enabled boolean DEFAULT true
);
CREATE TABLE IF NOT EXISTS sites (
  id serial PRIMARY KEY, name text NOT NULL, dc_tier text NOT NULL CHECK (dc_tier IN ('MAIN','SUB','CUSTOMER')),
  account_id int REFERENCES accounts(id), lat double precision, lon double precision, timezone text DEFAULT 'UTC'
);
CREATE TABLE IF NOT EXISTS contracts (
  id serial PRIMARY KEY, account_id int NOT NULL REFERENCES accounts(id), name text NOT NULL,
  sla_policy_id int NOT NULL REFERENCES sla_policies(id), start_date date NOT NULL, end_date date NOT NULL,
  value numeric(12,2) DEFAULT 0, status text NOT NULL DEFAULT 'active'
);
CREATE TABLE IF NOT EXISTS opportunities (
  id serial PRIMARY KEY, account_id int NOT NULL REFERENCES accounts(id), name text NOT NULL,
  stage text NOT NULL DEFAULT 'Prospect', amount numeric(12,2) DEFAULT 0, close_date date, source text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS config_items (
  id serial PRIMARY KEY, ci_class text NOT NULL, name text NOT NULL, serial text, mac text, hostname text,
  site_id int REFERENCES sites(id), owner_account_id int REFERENCES accounts(id),
  lifecycle text NOT NULL DEFAULT 'Deployed', criticality text NOT NULL DEFAULT 'Medium',
  state text NOT NULL DEFAULT 'UP',      -- UP | DOWN | DEGRADED | UNKNOWN
  attributes jsonb NOT NULL DEFAULT '{}', discovered_by text, last_seen timestamptz DEFAULT now(),
  UNIQUE (serial)
);
CREATE TABLE IF NOT EXISTS ci_relationships (
  id serial PRIMARY KEY, from_ci int NOT NULL REFERENCES config_items(id) ON DELETE CASCADE,
  to_ci int NOT NULL REFERENCES config_items(id) ON DELETE CASCADE,
  rel_type text NOT NULL, attrs jsonb DEFAULT '{}', UNIQUE (from_ci, to_ci, rel_type)
);  -- from_ci DEPENDS_ON/CONNECTS_TO/RUNS_ON to_ci  (to_ci failing impacts from_ci)
CREATE TABLE IF NOT EXISTS ci_account_impact (
  ci_id int REFERENCES config_items(id) ON DELETE CASCADE, account_id int REFERENCES accounts(id),
  PRIMARY KEY (ci_id, account_id)
);
CREATE TABLE IF NOT EXISTS contract_covered_ci (
  contract_id int REFERENCES contracts(id) ON DELETE CASCADE, ci_id int REFERENCES config_items(id) ON DELETE CASCADE,
  PRIMARY KEY (contract_id, ci_id)
);
CREATE TABLE IF NOT EXISTS warranties (
  id serial PRIMARY KEY, ci_id int NOT NULL REFERENCES config_items(id) ON DELETE CASCADE,
  vendor text, support_level text, start_date date, end_date date NOT NULL, renewal_flagged boolean DEFAULT false
);
CREATE TABLE IF NOT EXISTS lifecycle_events (
  id serial PRIMARY KEY, ci_id int REFERENCES config_items(id) ON DELETE CASCADE,
  from_stage text, to_stage text, actor text, at timestamptz DEFAULT now()
);
CREATE TABLE IF NOT EXISTS subnets (
  id serial PRIMARY KEY, cidr cidr NOT NULL UNIQUE, name text, vlan int, site_id int REFERENCES sites(id)
);
CREATE TABLE IF NOT EXISTS ip_addresses (
  id serial PRIMARY KEY, subnet_id int NOT NULL REFERENCES subnets(id) ON DELETE CASCADE,
  ip inet NOT NULL, ci_id int REFERENCES config_items(id) ON DELETE SET NULL, mac text,
  state text NOT NULL DEFAULT 'used', UNIQUE (ip)
);
CREATE TABLE IF NOT EXISTS collectors (
  id serial PRIMARY KEY, site_id int NOT NULL REFERENCES sites(id), name text NOT NULL, version text DEFAULT '1.0.0',
  last_heartbeat timestamptz, queue_depth int DEFAULT 0, wan_up boolean DEFAULT true, status text DEFAULT 'ONLINE',
  last_seq bigint DEFAULT 0, raw_samples_total bigint DEFAULT 0, forwarded_points_total bigint DEFAULT 0
);
CREATE TABLE IF NOT EXISTS checks (
  id serial PRIMARY KEY, ci_id int NOT NULL REFERENCES config_items(id) ON DELETE CASCADE, metric text NOT NULL,
  protocol text DEFAULT 'SNMP', warn double precision, crit double precision, sustain_samples int DEFAULT 3,
  UNIQUE (ci_id, metric)
);
CREATE TABLE IF NOT EXISTS metrics (
  time timestamptz NOT NULL, ci_id int NOT NULL, metric text NOT NULL,
  avg double precision, min double precision, max double precision, p95 double precision, samples int DEFAULT 1,
  PRIMARY KEY (time, ci_id, metric)
);  -- 1-minute aggregates forwarded from Sub DCs; becomes a hypertable when TimescaleDB is present
CREATE INDEX IF NOT EXISTS metrics_ci_time ON metrics (ci_id, metric, time DESC);
CREATE TABLE IF NOT EXISTS iot_telemetry (
  time timestamptz NOT NULL, ci_id int NOT NULL, topic text NOT NULL, value double precision, payload jsonb
);
CREATE INDEX IF NOT EXISTS iot_ci_time ON iot_telemetry (ci_id, time DESC);
CREATE TABLE IF NOT EXISTS syslog_events (
  id bigserial PRIMARY KEY, time timestamptz DEFAULT now(), host text, severity int, facility int, message text, ci_id int
);
CREATE TABLE IF NOT EXISTS maintenance_windows (
  id serial PRIMARY KEY, name text, ci_id int REFERENCES config_items(id) ON DELETE CASCADE, site_id int REFERENCES sites(id),
  start_at timestamptz NOT NULL, end_at timestamptz NOT NULL, suppress_alerts boolean DEFAULT true, pause_sla boolean DEFAULT false
);
CREATE TABLE IF NOT EXISTS queues (id serial PRIMARY KEY, name text UNIQUE NOT NULL);
CREATE TABLE IF NOT EXISTS tickets (
  id serial PRIMARY KEY, number text UNIQUE NOT NULL, account_id int REFERENCES accounts(id), contact_id int REFERENCES contacts(id),
  ci_id int REFERENCES config_items(id), contract_id int REFERENCES contracts(id), parent_ticket_id int REFERENCES tickets(id),
  subject text NOT NULL, description text, type text NOT NULL DEFAULT 'Incident',
  priority text NOT NULL DEFAULT 'P3', status text NOT NULL DEFAULT 'New',
  channel text NOT NULL DEFAULT 'portal', queue text DEFAULT 'Service Desk', assignee text,
  source_alert_id int, repeat_count int DEFAULT 1, sla_breached boolean DEFAULT false, escalation_level int DEFAULT 0,
  csat int, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), resolved_at timestamptz
);
CREATE INDEX IF NOT EXISTS tickets_status ON tickets (status, priority);
CREATE TABLE IF NOT EXISTS ticket_events (
  id bigserial PRIMARY KEY, ticket_id int NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  type text NOT NULL, actor text, body text, payload jsonb DEFAULT '{}', at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS sla_timers (
  id serial PRIMARY KEY, ticket_id int NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('response','resolution')), state text NOT NULL DEFAULT 'running', -- running|paused|met|breached
  target_min int NOT NULL, clock text NOT NULL, calendar_id int REFERENCES business_calendars(id),
  started_at timestamptz NOT NULL, due_at timestamptz NOT NULL, paused_at timestamptz,
  remaining_min double precision, warned_pct int DEFAULT 0, breached_at timestamptz, met_at timestamptz,
  UNIQUE (ticket_id, kind)
);
CREATE TABLE IF NOT EXISTS alerts (
  id serial PRIMARY KEY, ci_id int NOT NULL REFERENCES config_items(id) ON DELETE CASCADE, metric text NOT NULL,
  severity text NOT NULL, state text NOT NULL DEFAULT 'open',    -- open|acked|closed
  fingerprint text NOT NULL, message text, value double precision, suppressed boolean DEFAULT false,
  repeat_count int DEFAULT 1, ticket_id int REFERENCES tickets(id), root_cause_ci int,
  first_seen timestamptz NOT NULL DEFAULT now(), last_seen timestamptz NOT NULL DEFAULT now(), closed_at timestamptz, acked_by text
);
CREATE UNIQUE INDEX IF NOT EXISTS alerts_open_fp ON alerts (fingerprint) WHERE state <> 'closed';
CREATE TABLE IF NOT EXISTS workflow_rules (
  code text PRIMARY KEY, name text NOT NULL, description text, enabled boolean DEFAULT true, params jsonb DEFAULT '{}'
);
CREATE TABLE IF NOT EXISTS workflow_executions (
  id bigserial PRIMARY KEY, rule_code text, trigger text, subject text, outcome text, at timestamptz DEFAULT now()
);
CREATE TABLE IF NOT EXISTS kb_articles (
  id serial PRIMARY KEY, title text NOT NULL, body text, tags text[] DEFAULT '{}'
);
CREATE TABLE IF NOT EXISTS activities (
  id serial PRIMARY KEY, account_id int REFERENCES accounts(id), kind text, note text, actor text, at timestamptz DEFAULT now()
);
CREATE TABLE IF NOT EXISTS audit_log (
  id bigserial PRIMARY KEY, actor text, action text, entity text, entity_id text, detail jsonb, at timestamptz DEFAULT now()
);
CREATE TABLE IF NOT EXISTS notifications (
  id bigserial PRIMARY KEY, channel text, recipient text, subject text, body text, ref text, at timestamptz DEFAULT now()
);
CREATE TABLE IF NOT EXISTS users (
  id serial PRIMARY KEY, username text UNIQUE NOT NULL, display_name text, role text NOT NULL
    CHECK (role IN ('admin','agent','engineer','account_manager','noc','customer')),
  password_hash text NOT NULL, account_id int REFERENCES accounts(id), active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now(), last_login timestamptz
);
