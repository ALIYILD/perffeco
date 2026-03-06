import type { Handler, HandlerEvent } from "@netlify/functions";
import { getDb } from "./lib/supabase.js";
import { hashApiKey, generateApiKey } from "./lib/api-auth.js";

function json(body: unknown, status = 200) {
  return { statusCode: status, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
}

export const handler: Handler = async (event: HandlerEvent) => {
  const method = event.httpMethod;
  if (method === "OPTIONS") return { statusCode: 204, body: "" };

  try {
    const db = getDb();

    if (method === "GET") {
      const userId = event.queryStringParameters?.user_id;
      if (!userId) return json({ error: "user_id is required" }, 400);

      const { data: keys } = await db
        .from("api_keys")
        .select("id, key_prefix, name, calls_today, calls_month, active, created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });

      return json({ keys: keys ?? [] });
    }

    if (method === "POST") {
      const { user_id, name } = JSON.parse(event.body ?? "{}");
      if (!user_id) return json({ error: "user_id is required" }, 400);

      // Check plan allows API keys (team+)
      const { data: profile } = await db.from("profiles").select("plan, team_id").eq("id", user_id).single();
      if (!profile) return json({ error: "User not found" }, 404);

      let plan = profile.plan ?? "free";
      let teamId = profile.team_id ?? null;
      if (teamId) {
        const { data: team } = await db.from("teams").select("plan").eq("id", teamId).single();
        plan = team?.plan ?? plan;
      }

      if (plan !== "team" && plan !== "enterprise") {
        return json({ error: "API keys require a Team or Enterprise plan." }, 403);
      }

      // Generate key
      const rawKey = generateApiKey();
      const keyHash = hashApiKey(rawKey);
      const keyPrefix = rawKey.slice(0, 12) + "...";

      const { data: apiKey, error } = await db
        .from("api_keys")
        .insert({
          user_id,
          team_id: teamId,
          key_hash: keyHash,
          key_prefix: keyPrefix,
          name: name?.trim() || "Default",
        })
        .select("id, key_prefix, name, created_at")
        .single();

      if (error) return json({ error: error.message }, 500);

      // Return raw key ONCE — user must copy it now
      return json({ key: { ...apiKey, raw_key: rawKey } }, 201);
    }

    if (method === "DELETE") {
      const keyId = event.queryStringParameters?.key_id;
      if (!keyId) return json({ error: "key_id is required" }, 400);

      const { error } = await db.from("api_keys").update({ active: false }).eq("id", keyId);
      if (error) return json({ error: error.message }, 500);
      return json({ success: true });
    }

    return json({ error: "Method not allowed" }, 405);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Internal error";
    console.error("api-keys error:", msg);
    return json({ error: msg }, 500);
  }
};
