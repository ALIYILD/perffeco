import type { Handler, HandlerEvent } from "@netlify/functions";
import { getDb } from "./lib/supabase.js";

function json(body: unknown, status = 200) {
  return { statusCode: status, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
}

function getEffectivePlan(profile: { plan?: string; team_id?: string }, teamPlan?: string): string {
  if (profile.team_id && teamPlan) return teamPlan;
  return profile.plan ?? "free";
}

export const handler: Handler = async (event: HandlerEvent) => {
  const method = event.httpMethod;
  if (method === "OPTIONS") return { statusCode: 204, body: "" };

  try {
    const db = getDb();

    if (method === "GET") {
      const userId = event.queryStringParameters?.user_id;
      if (!userId) return json({ error: "user_id is required" }, 400);

      const { data: alerts } = await db
        .from("price_alerts")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });

      return json({ alerts: alerts ?? [] });
    }

    if (method === "POST") {
      const { user_id, model_name, threshold, condition } = JSON.parse(event.body ?? "{}");
      if (!user_id || !model_name || threshold == null || !condition) {
        return json({ error: "user_id, model_name, threshold, and condition are required" }, 400);
      }

      // Check plan allows alerts (team+)
      const { data: profile } = await db.from("profiles").select("plan, team_id").eq("id", user_id).single();
      if (!profile) return json({ error: "User not found" }, 404);

      let plan = profile.plan ?? "free";
      if (profile.team_id) {
        const { data: team } = await db.from("teams").select("plan").eq("id", profile.team_id).single();
        plan = getEffectivePlan(profile, team?.plan);
      }

      if (plan !== "team" && plan !== "enterprise") {
        return json({ error: "Custom alerts require a Team or Enterprise plan." }, 403);
      }

      const { data: alert, error } = await db
        .from("price_alerts")
        .insert({ user_id, model_name, threshold, condition, active: true })
        .select("*")
        .single();

      if (error) return json({ error: error.message }, 500);
      return json({ alert }, 201);
    }

    if (method === "PUT") {
      const { alert_id, active } = JSON.parse(event.body ?? "{}");
      if (!alert_id || active === undefined) return json({ error: "alert_id and active are required" }, 400);

      const { data: alert, error } = await db
        .from("price_alerts")
        .update({ active })
        .eq("id", alert_id)
        .select("*")
        .single();

      if (error) return json({ error: error.message }, 500);
      return json({ alert });
    }

    if (method === "DELETE") {
      const alertId = event.queryStringParameters?.alert_id;
      if (!alertId) return json({ error: "alert_id is required" }, 400);

      const { error } = await db.from("price_alerts").delete().eq("id", alertId);
      if (error) return json({ error: error.message }, 500);
      return json({ success: true });
    }

    return json({ error: "Method not allowed" }, 405);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Internal error";
    console.error("alerts error:", msg);
    return json({ error: msg }, 500);
  }
};
