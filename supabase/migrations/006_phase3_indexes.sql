-- Phase 3: Indexes, unique constraint, RPC, and RLS for dashboards & usage tracking

-- ============================================================
-- Unique constraint for usage log upsert (one row per team+user+action+day)
-- ============================================================
DO $$ BEGIN
  ALTER TABLE team_usage_log
    ADD CONSTRAINT uq_team_usage_log_key UNIQUE (team_id, user_id, action, date);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================
-- RPC: increment_usage_log — upsert with count increment
-- ============================================================
CREATE OR REPLACE FUNCTION increment_usage_log(
  p_team_id UUID,
  p_user_id UUID,
  p_action TEXT,
  p_date DATE
) RETURNS void AS $$
BEGIN
  INSERT INTO team_usage_log (team_id, user_id, action, date, count)
  VALUES (p_team_id, p_user_id, p_action, p_date, 1)
  ON CONFLICT (team_id, user_id, action, date)
  DO UPDATE SET count = team_usage_log.count + 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- Composite indexes for analytics queries
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_team_usage_log_team_date
  ON team_usage_log (team_id, date DESC);

CREATE INDEX IF NOT EXISTS idx_team_usage_log_team_user
  ON team_usage_log (team_id, user_id);

CREATE INDEX IF NOT EXISTS idx_saved_dashboards_share_token
  ON saved_dashboards (share_token) WHERE share_token IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_saved_dashboards_team_id
  ON saved_dashboards (team_id);

-- ============================================================
-- RLS policies for saved_dashboards (insert/update/delete by creator)
-- ============================================================
ALTER TABLE saved_dashboards ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS saved_dashboards_select ON saved_dashboards;
CREATE POLICY saved_dashboards_select ON saved_dashboards
  FOR SELECT USING (true);

DROP POLICY IF EXISTS saved_dashboards_insert ON saved_dashboards;
CREATE POLICY saved_dashboards_insert ON saved_dashboards
  FOR INSERT WITH CHECK (created_by = auth.uid());

DROP POLICY IF EXISTS saved_dashboards_update ON saved_dashboards;
CREATE POLICY saved_dashboards_update ON saved_dashboards
  FOR UPDATE USING (created_by = auth.uid());

DROP POLICY IF EXISTS saved_dashboards_delete ON saved_dashboards;
CREATE POLICY saved_dashboards_delete ON saved_dashboards
  FOR DELETE USING (created_by = auth.uid());

-- ============================================================
-- RLS policy for team_usage_log (service role insert only)
-- ============================================================
ALTER TABLE team_usage_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS team_usage_log_insert ON team_usage_log;
CREATE POLICY team_usage_log_insert ON team_usage_log
  FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS team_usage_log_select ON team_usage_log;
CREATE POLICY team_usage_log_select ON team_usage_log
  FOR SELECT USING (true);
