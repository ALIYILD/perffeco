-- 002_create_rls_policies.sql
-- Enable RLS and create user-scoped policies on all tables.

-- ============================================================
-- Enable RLS
-- ============================================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.extracted_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- profiles: users can only read/update their own profile
-- ============================================================
CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

-- ============================================================
-- agent_jobs: user-scoped CRUD
-- ============================================================
CREATE POLICY "Users can view own jobs"
  ON public.agent_jobs FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own jobs"
  ON public.agent_jobs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own jobs"
  ON public.agent_jobs FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own jobs"
  ON public.agent_jobs FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================================
-- agent_runs: user-scoped read (writes via service role only)
-- ============================================================
CREATE POLICY "Users can view own runs"
  ON public.agent_runs FOR SELECT
  USING (auth.uid() = user_id);

-- ============================================================
-- extracted_data: user-scoped read
-- ============================================================
CREATE POLICY "Users can view own extracted data"
  ON public.extracted_data FOR SELECT
  USING (auth.uid() = user_id);

-- ============================================================
-- audit_log: user-scoped read only
-- ============================================================
CREATE POLICY "Users can view own audit log"
  ON public.audit_log FOR SELECT
  USING (auth.uid() = user_id);
