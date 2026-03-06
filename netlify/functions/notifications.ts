import type { Handler, HandlerEvent } from "@netlify/functions";
import { getDb } from "./lib/supabase.js";

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

      const { data: notifications } = await db
        .from("in_app_notifications")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(50);

      return json({ notifications: notifications ?? [] });
    }

    if (method === "PUT") {
      const { notification_id, mark_all, user_id } = JSON.parse(event.body ?? "{}");

      if (mark_all && user_id) {
        // Mark all as read
        await db.from("in_app_notifications").update({ read: true }).eq("user_id", user_id).eq("read", false);
        return json({ success: true });
      }

      if (notification_id) {
        await db.from("in_app_notifications").update({ read: true }).eq("id", notification_id);
        return json({ success: true });
      }

      return json({ error: "notification_id or (mark_all + user_id) required" }, 400);
    }

    return json({ error: "Method not allowed" }, 405);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Internal error";
    console.error("notifications error:", msg);
    return json({ error: msg }, 500);
  }
};
