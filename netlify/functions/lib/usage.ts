import { getDb } from "./supabase.js";

/**
 * Fire-and-forget usage logger. Upserts one row per team+user+action+date.
 * Never throws — wraps everything in try/catch so it never breaks the parent request.
 */
export function logUsage(teamId: string | null | undefined, userId: string, action: string): void {
  if (!teamId) return;
  try {
    const db = getDb();
    const today = new Date().toISOString().slice(0, 10);
    db.rpc("increment_usage_log", {
      p_team_id: teamId,
      p_user_id: userId,
      p_action: action,
      p_date: today,
    }).then(() => {}).catch(() => {});
  } catch {
    // never fail the parent
  }
}
