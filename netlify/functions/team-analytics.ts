import type { Handler, HandlerEvent } from "@netlify/functions";
import { getDb } from "./lib/supabase.js";

function json(body: unknown, status = 200) {
  return { statusCode: status, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
}

export const handler: Handler = async (event: HandlerEvent) => {
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, body: "" };
  if (event.httpMethod !== "GET") return json({ error: "Method not allowed" }, 405);

  try {
    const db = getDb();
    const userId = event.queryStringParameters?.user_id;
    const teamId = event.queryStringParameters?.team_id;

    if (!userId || !teamId) return json({ error: "user_id and team_id required" }, 400);

    // Owner-only check
    const { data: member } = await db
      .from("team_members")
      .select("role")
      .eq("team_id", teamId)
      .eq("user_id", userId)
      .single();

    if (!member || member.role !== "owner") {
      return json({ error: "Team analytics is available to team owners only." }, 403);
    }

    // Last 30 days cutoff
    const since = new Date();
    since.setDate(since.getDate() - 30);
    const sinceStr = since.toISOString().slice(0, 10);

    // Daily usage by action type
    const { data: daily } = await db
      .from("team_usage_log")
      .select("action, date, count")
      .eq("team_id", teamId)
      .gte("date", sinceStr)
      .order("date", { ascending: true });

    // Member breakdown — aggregate by user_id
    const { data: memberRows } = await db
      .from("team_usage_log")
      .select("user_id, count")
      .eq("team_id", teamId)
      .gte("date", sinceStr);

    // Aggregate member totals
    const memberMap: Record<string, number> = {};
    (memberRows ?? []).forEach((r) => {
      memberMap[r.user_id] = (memberMap[r.user_id] || 0) + (r.count || 1);
    });

    // Resolve emails for display
    const userIds = Object.keys(memberMap);
    const members: { label: string; total: number }[] = [];
    for (const uid of userIds) {
      const { data: profile } = await db.from("profiles").select("id").eq("id", uid).single();
      // Try auth.users for email — fallback to uid prefix
      let label = uid.slice(0, 8);
      try {
        const { data: authUser } = await db.from("auth.users").select("email").eq("id", uid).single();
        if (authUser?.email) label = authUser.email.split("@")[0];
      } catch {
        // fallback to uid prefix
      }
      members.push({ label, total: memberMap[uid] });
    }
    members.sort((a, b) => b.total - a.total);

    // Summary
    const totalActions = (daily ?? []).reduce((s, r) => s + (r.count || 1), 0);
    const apiCalls = (daily ?? []).filter((r) => r.action === "api_call").reduce((s, r) => s + (r.count || 1), 0);

    return json({
      daily: daily ?? [],
      members,
      summary: {
        total_actions: totalActions,
        api_calls: apiCalls,
        active_members: userIds.length,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Internal error";
    console.error("team-analytics error:", msg);
    return json({ error: msg }, 500);
  }
};
