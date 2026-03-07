-- 001_create_tables.sql
-- Paste this into the Supabase SQL editor to create all tables.

-- ============================================================
-- 1. profiles — extends auth.users with plan + rate limit info
-- ============================================================
CREATE TABLE public.profiles (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email       TEXT,
  plan        TEXT NOT NULL DEFAULT 'free' CHECK (plan IN ('free','pro','team','enterprise')),
  runs_today  INT NOT NULL DEFAULT 0,
  runs_date   DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_profiles_plan ON public.profiles(plan);

-- ============================================================
-- 2. agent_jobs — saved source configurations
-- ============================================================
CREATE TABLE public.agent_jobs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  url         TEXT NOT NULL,
  extractors  TEXT[] NOT NULL DEFAULT '{table}',
  schedule    TEXT DEFAULT NULL, -- 'daily', 'hourly', or null
  active      BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_agent_jobs_user ON public.agent_jobs(user_id);

-- ============================================================
-- 3. agent_runs — execution log for each run
-- ============================================================
CREATE TABLE public.agent_runs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  job_id        UUID REFERENCES public.agent_jobs(id) ON DELETE SET NULL,
  url           TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','running','completed','failed','blocked')),
  extractors    TEXT[] NOT NULL DEFAULT '{table}',
  started_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at   TIMESTAMPTZ,
  duration_ms   INT,
  error         TEXT,
  html_excerpt  TEXT, -- first 2000 chars of fetched HTML (optional)
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_agent_runs_user ON public.agent_runs(user_id);
CREATE INDEX idx_agent_runs_status ON public.agent_runs(status);
CREATE INDEX idx_agent_runs_created ON public.agent_runs(created_at DESC);

-- ============================================================
-- 4. extracted_data — results from each run
-- ============================================================
CREATE TABLE public.extracted_data (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id      UUID NOT NULL REFERENCES public.agent_runs(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  extractor   TEXT NOT NULL, -- 'table', 'jsonld'
  data        JSONB NOT NULL DEFAULT '[]',
  row_count   INT NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_extracted_data_run ON public.extracted_data(run_id);
CREATE INDEX idx_extracted_data_user ON public.extracted_data(user_id);

-- ============================================================
-- 5. audit_log — security + compliance trail
-- ============================================================
CREATE TABLE public.audit_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  action      TEXT NOT NULL, -- 'agent.run', 'agent.job.create', etc.
  target_url  TEXT,
  metadata    JSONB DEFAULT '{}',
  ip_address  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_log_user ON public.audit_log(user_id);
CREATE INDEX idx_audit_log_action ON public.audit_log(action);
CREATE INDEX idx_audit_log_created ON public.audit_log(created_at DESC);
