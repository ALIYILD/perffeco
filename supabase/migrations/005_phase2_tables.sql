-- Phase 2: Teams, API Keys, Alert History, Notifications, Usage Logging, Saved Dashboards
-- Run via Supabase Management API or psql

-- ===================== TABLES =====================

-- Teams
CREATE TABLE IF NOT EXISTS teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan TEXT NOT NULL DEFAULT 'team' CHECK (plan IN ('team', 'enterprise')),
  max_seats INT NOT NULL DEFAULT 10,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Team members
CREATE TABLE IF NOT EXISTS team_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member')),
  invited_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  joined_at TIMESTAMPTZ,
  invite_email TEXT,
  invite_token TEXT UNIQUE
);

-- API keys
CREATE TABLE IF NOT EXISTS api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  team_id UUID REFERENCES teams(id) ON DELETE SET NULL,
  key_hash TEXT NOT NULL UNIQUE,
  key_prefix TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT 'Default',
  calls_today INT NOT NULL DEFAULT 0,
  calls_date DATE NOT NULL DEFAULT CURRENT_DATE,
  calls_month INT NOT NULL DEFAULT 0,
  calls_month_date DATE NOT NULL DEFAULT date_trunc('month', CURRENT_DATE)::date,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Alert history
CREATE TABLE IF NOT EXISTS alert_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_id UUID NOT NULL REFERENCES price_alerts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  model_name TEXT NOT NULL,
  current_price DOUBLE PRECISION NOT NULL,
  threshold DOUBLE PRECISION NOT NULL,
  condition TEXT NOT NULL CHECK (condition IN ('below', 'above')),
  channel TEXT NOT NULL DEFAULT 'in_app' CHECK (channel IN ('telegram', 'in_app')),
  delivered_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- In-app notifications
CREATE TABLE IF NOT EXISTS in_app_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL DEFAULT 'alert' CHECK (type IN ('alert', 'team', 'system')),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  read BOOLEAN NOT NULL DEFAULT false,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Team usage log
CREATE TABLE IF NOT EXISTS team_usage_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  count INT NOT NULL DEFAULT 1,
  date DATE NOT NULL DEFAULT CURRENT_DATE
);

-- Saved dashboards (schema only, no UI this phase)
CREATE TABLE IF NOT EXISTS saved_dashboards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  config JSONB NOT NULL DEFAULT '{}',
  share_token TEXT UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ===================== ALTER EXISTING TABLES =====================

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES teams(id) ON DELETE SET NULL;

ALTER TABLE price_alerts ADD COLUMN IF NOT EXISTS last_notified_at TIMESTAMPTZ;

-- ===================== INDEXES =====================

CREATE INDEX IF NOT EXISTS idx_team_members_team_id ON team_members(team_id);
CREATE INDEX IF NOT EXISTS idx_team_members_user_id ON team_members(user_id);
CREATE INDEX IF NOT EXISTS idx_team_members_invite_token ON team_members(invite_token) WHERE invite_token IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_api_keys_key_hash ON api_keys(key_hash);
CREATE INDEX IF NOT EXISTS idx_api_keys_user_id ON api_keys(user_id);
CREATE INDEX IF NOT EXISTS idx_alert_history_user_id ON alert_history(user_id);
CREATE INDEX IF NOT EXISTS idx_in_app_notifications_user_id ON in_app_notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_team_usage_log_team_id ON team_usage_log(team_id);
CREATE INDEX IF NOT EXISTS idx_profiles_team_id ON profiles(team_id) WHERE team_id IS NOT NULL;

-- ===================== RLS =====================

ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE alert_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE in_app_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_usage_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE saved_dashboards ENABLE ROW LEVEL SECURITY;

-- Teams: owner can read/update
CREATE POLICY teams_owner_select ON teams FOR SELECT USING (owner_id = auth.uid());
CREATE POLICY teams_owner_update ON teams FOR UPDATE USING (owner_id = auth.uid());

-- Team members: team members can read their team's members
CREATE POLICY team_members_select ON team_members FOR SELECT
  USING (team_id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid()));
CREATE POLICY team_members_insert ON team_members FOR INSERT
  WITH CHECK (team_id IN (SELECT id FROM teams WHERE owner_id = auth.uid()));

-- API keys: users can manage their own keys
CREATE POLICY api_keys_user_select ON api_keys FOR SELECT USING (user_id = auth.uid());
CREATE POLICY api_keys_user_insert ON api_keys FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY api_keys_user_update ON api_keys FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY api_keys_user_delete ON api_keys FOR DELETE USING (user_id = auth.uid());

-- Alert history: users see their own
CREATE POLICY alert_history_user_select ON alert_history FOR SELECT USING (user_id = auth.uid());

-- Notifications: users see their own
CREATE POLICY notifications_user_select ON in_app_notifications FOR SELECT USING (user_id = auth.uid());
CREATE POLICY notifications_user_update ON in_app_notifications FOR UPDATE USING (user_id = auth.uid());

-- Team usage log: team members can see
CREATE POLICY team_usage_log_select ON team_usage_log FOR SELECT
  USING (team_id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid()));

-- Saved dashboards: team members can see
CREATE POLICY saved_dashboards_select ON saved_dashboards FOR SELECT
  USING (team_id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid()));

-- ===================== FUNCTIONS =====================

-- API rate limit checker: increments calls_month, returns whether allowed
CREATE OR REPLACE FUNCTION check_api_rate_limit(p_key_hash TEXT, p_monthly_limit INT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_calls_month INT;
  v_month_date DATE;
  v_current_month DATE := date_trunc('month', CURRENT_DATE)::date;
BEGIN
  SELECT calls_month, calls_month_date INTO v_calls_month, v_month_date
  FROM api_keys WHERE key_hash = p_key_hash AND active = true;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  -- Reset monthly counter if new month
  IF v_month_date < v_current_month THEN
    UPDATE api_keys SET calls_month = 1, calls_month_date = v_current_month,
      calls_today = 1, calls_date = CURRENT_DATE
    WHERE key_hash = p_key_hash;
    RETURN true;
  END IF;

  -- Check limit (0 = unlimited)
  IF p_monthly_limit > 0 AND v_calls_month >= p_monthly_limit THEN
    RETURN false;
  END IF;

  -- Increment
  UPDATE api_keys SET
    calls_month = CASE WHEN calls_month_date < v_current_month THEN 1 ELSE calls_month + 1 END,
    calls_month_date = v_current_month,
    calls_today = CASE WHEN calls_date < CURRENT_DATE THEN 1 ELSE calls_today + 1 END,
    calls_date = CURRENT_DATE
  WHERE key_hash = p_key_hash;

  RETURN true;
END;
$$;
