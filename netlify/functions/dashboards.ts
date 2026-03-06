import type { Handler, HandlerEvent } from "@netlify/functions";
import { randomBytes } from "crypto";
import { getDb } from "./lib/supabase.js";
import { logUsage } from "./lib/usage.js";

function json(body: unknown, status = 200) {
  return { statusCode: status, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
}

export const handler: Handler = async (event: HandlerEvent) => {
  const method = event.httpMethod;
  if (method === "OPTIONS") return { statusCode: 204, body: "" };

  try {
    const db = getDb();

    if (method === "GET") {
      // Public access by share token
      const shareToken = event.queryStringParameters?.share_token;
      if (shareToken) {
        const { data: dash } = await db
          .from("saved_dashboards")
          .select("id, name, config, created_at")
          .eq("share_token", shareToken)
          .single();
        if (!dash) return json({ error: "Dashboard not found or link expired" }, 404);
        return json({ dashboard: dash });
      }

      // Authenticated: list team dashboards
      const teamId = event.queryStringParameters?.team_id;
      if (!teamId) return json({ error: "team_id or share_token required" }, 400);

      const { data: dashboards } = await db
        .from("saved_dashboards")
        .select("id, name, config, share_token, created_by, created_at, updated_at")
        .eq("team_id", teamId)
        .order("created_at", { ascending: false })
        .limit(10);

      return json({ dashboards: dashboards ?? [] });
    }

    if (method === "POST") {
      const { team_id, user_id, name, config } = JSON.parse(event.body ?? "{}");
      if (!team_id || !user_id || !name || !config) {
        return json({ error: "team_id, user_id, name, and config are required" }, 400);
      }

      // Enforce 10-per-team limit
      const { count } = await db
        .from("saved_dashboards")
        .select("id", { count: "exact", head: true })
        .eq("team_id", team_id);

      if ((count ?? 0) >= 10) {
        return json({ error: "Maximum 10 saved dashboards per team. Delete one to save a new view." }, 400);
      }

      const { data: dash, error } = await db
        .from("saved_dashboards")
        .insert({ team_id, created_by: user_id, name, config })
        .select("*")
        .single();

      if (error) return json({ error: error.message }, 500);
      logUsage(team_id, user_id, "dashboard_save");
      return json({ dashboard: dash }, 201);
    }

    if (method === "PUT") {
      const { dashboard_id, user_id, name, config, generate_share } = JSON.parse(event.body ?? "{}");
      if (!dashboard_id || !user_id) return json({ error: "dashboard_id and user_id required" }, 400);

      const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (name) updates.name = name;
      if (config) updates.config = config;

      if (generate_share) {
        updates.share_token = randomBytes(16).toString("hex");
      }

      const { data: dash, error } = await db
        .from("saved_dashboards")
        .update(updates)
        .eq("id", dashboard_id)
        .eq("created_by", user_id)
        .select("*")
        .single();

      if (error) return json({ error: error.message }, 500);
      if (!dash) return json({ error: "Dashboard not found or not yours" }, 404);

      if (generate_share) {
        const { data: profile } = await db.from("profiles").select("team_id").eq("id", user_id).single();
        logUsage(profile?.team_id, user_id, "dashboard_share");
      }

      return json({ dashboard: dash });
    }

    if (method === "DELETE") {
      const dashId = event.queryStringParameters?.dashboard_id;
      const userId = event.queryStringParameters?.user_id;
      if (!dashId || !userId) return json({ error: "dashboard_id and user_id required" }, 400);

      const { error } = await db
        .from("saved_dashboards")
        .delete()
        .eq("id", dashId)
        .eq("created_by", userId);

      if (error) return json({ error: error.message }, 500);
      return json({ success: true });
    }

    return json({ error: "Method not allowed" }, 405);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Internal error";
    console.error("dashboards error:", msg);
    return json({ error: msg }, 500);
  }
};
