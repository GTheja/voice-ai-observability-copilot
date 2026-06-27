-- Voice AI Observability Copilot — schema
-- Idempotent: safe to run repeatedly (CREATE ... IF NOT EXISTS).

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS agents (
  id           TEXT PRIMARY KEY,            -- GHL agent id
  location_id  TEXT NOT NULL,
  name         TEXT NOT NULL,
  goal         TEXT,                        -- the agent's objective / script summary
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_agents_location ON agents(location_id);

CREATE TABLE IF NOT EXISTS kpi_definitions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id    TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  key         TEXT NOT NULL,
  label       TEXT NOT NULL,
  type        TEXT NOT NULL,
  config      JSONB NOT NULL DEFAULT '{}'::jsonb,
  severity    TEXT NOT NULL DEFAULT 'medium',
  enabled     BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (agent_id, key)
);
CREATE INDEX IF NOT EXISTS idx_kpi_agent ON kpi_definitions(agent_id) WHERE enabled;

CREATE TABLE IF NOT EXISTS calls (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key TEXT NOT NULL,            -- provider:callId
  provider        TEXT NOT NULL DEFAULT 'ghl',
  location_id     TEXT NOT NULL,
  agent_id        TEXT NOT NULL,
  external_call_id TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'received',
  direction       TEXT,
  outcome         TEXT,
  duration_sec    INTEGER,
  started_at      TIMESTAMPTZ,
  transcript      JSONB NOT NULL,           -- { turns: [...] }
  metadata        JSONB NOT NULL DEFAULT '{}'::jsonb,
  attempts        INTEGER NOT NULL DEFAULT 0,
  last_error      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (idempotency_key)
);
CREATE INDEX IF NOT EXISTS idx_calls_lookup ON calls(location_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_calls_agent ON calls(agent_id, created_at DESC);

CREATE TABLE IF NOT EXISTS analyses (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id       UUID NOT NULL REFERENCES calls(id) ON DELETE CASCADE,
  agent_id      TEXT NOT NULL,
  overall_score NUMERIC(5,2),               -- 0..100 weighted KPI score
  passed        BOOLEAN,
  kpi_results   JSONB NOT NULL DEFAULT '[]'::jsonb,  -- [{key,label,passed,score,evidence}]
  summary       TEXT,
  llm_used      BOOLEAN NOT NULL DEFAULT false,
  prompt_version TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (call_id)
);
CREATE INDEX IF NOT EXISTS idx_analyses_agent ON analyses(agent_id, created_at DESC);

CREATE TABLE IF NOT EXISTS recommendations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_id UUID NOT NULL REFERENCES analyses(id) ON DELETE CASCADE,
  agent_id    TEXT NOT NULL,
  kpi_key     TEXT,
  title       TEXT NOT NULL,
  body        TEXT NOT NULL,                -- the concrete prompt/script change
  severity    TEXT NOT NULL DEFAULT 'medium',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_recs_agent ON recommendations(agent_id, created_at DESC);

CREATE TABLE IF NOT EXISTS use_actions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_id UUID NOT NULL REFERENCES analyses(id) ON DELETE CASCADE,
  call_id     UUID NOT NULL REFERENCES calls(id) ON DELETE CASCADE,
  agent_id    TEXT NOT NULL,
  kind        TEXT NOT NULL,               -- human_review | script_training | escalation | compliance
  severity    TEXT NOT NULL DEFAULT 'medium',
  reason      TEXT NOT NULL,
  turn_index  INTEGER,
  start_sec   NUMERIC,
  end_sec     NUMERIC,
  excerpt     TEXT,
  resolved    BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_useactions_agent ON use_actions(agent_id, resolved, created_at DESC);

-- Permanent record of jobs that exhausted retries (mirrors BullMQ DLQ for auditing/replay).
CREATE TABLE IF NOT EXISTS dead_letters (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id     UUID REFERENCES calls(id) ON DELETE SET NULL,
  job_name    TEXT NOT NULL,
  payload     JSONB NOT NULL,
  error       TEXT NOT NULL,
  attempts    INTEGER NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  replayed_at TIMESTAMPTZ
);

-- OAuth tokens per installed location/company (marketplace app install grants).
CREATE TABLE IF NOT EXISTS oauth_tokens (
  location_id   TEXT PRIMARY KEY,
  company_id    TEXT,
  user_type     TEXT,                       -- Location | Company
  access_token  TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  scope         TEXT,
  expires_at    TIMESTAMPTZ NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
