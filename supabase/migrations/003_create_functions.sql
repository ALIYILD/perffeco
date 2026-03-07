-- 003_create_functions.sql
-- Auto-create profile trigger + rate limit helper function.

-- ============================================================
-- Auto-create profile on user signup
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email)
  VALUES (NEW.id, NEW.email);
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- Rate limit check + increment (called from Netlify functions)
-- Returns: { allowed: boolean, runs_today: int, limit: int }
-- ============================================================
CREATE OR REPLACE FUNCTION public.check_and_increment_rate_limit(
  p_user_id UUID,
  p_plan TEXT,
  p_limit INT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_runs_today INT;
  v_runs_date DATE;
BEGIN
  -- Get current rate limit state
  SELECT runs_today, runs_date
  INTO v_runs_today, v_runs_date
  FROM public.profiles
  WHERE id = p_user_id;

  -- Reset counter if new day
  IF v_runs_date < CURRENT_DATE THEN
    v_runs_today := 0;
    UPDATE public.profiles
    SET runs_today = 0, runs_date = CURRENT_DATE
    WHERE id = p_user_id;
  END IF;

  -- Check limit (0 = unlimited for enterprise)
  IF p_limit > 0 AND v_runs_today >= p_limit THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'runs_today', v_runs_today,
      'limit', p_limit
    );
  END IF;

  -- Increment
  UPDATE public.profiles
  SET runs_today = v_runs_today + 1, updated_at = now()
  WHERE id = p_user_id;

  RETURN jsonb_build_object(
    'allowed', true,
    'runs_today', v_runs_today + 1,
    'limit', p_limit
  );
END;
$$;
