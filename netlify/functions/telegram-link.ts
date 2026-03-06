import type { Handler, HandlerEvent } from "@netlify/functions";
import { getDb } from "./lib/supabase.js";

function corsHeaders(origin?: string) {
  const allowed = ["https://perffeco.com", "http://localhost:8888"];
  const o = origin && allowed.includes(origin) ? origin : allowed[0];
  return {
    "Access-Control-Allow-Origin": o,
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

function json(body: unknown, statusCode = 200, origin?: string) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
    body: JSON.stringify(body),
  };
}

function generateCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

export const handler: Handler = async (event: HandlerEvent) => {
  const origin = event.headers["origin"] ?? event.headers["Origin"];

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: corsHeaders(origin), body: "" };
  }

  if (event.httpMethod !== "POST") {
    return json({ error: "Method not allowed" }, 405, origin);
  }

  try {
    const body = JSON.parse(event.body ?? "{}") as { user_id?: string };
    const userId = body.user_id;

    if (!userId) {
      return json({ error: "user_id is required" }, 400, origin);
    }

    const db = getDb();
    const code = generateCode();
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 hour

    // Check if user already has a linked Telegram
    const { data: existing } = await db
      .from("telegram_links")
      .select("chat_id")
      .eq("user_id", userId)
      .not("chat_id", "is", null)
      .limit(1)
      .single();

    if (existing) {
      return json({ linked: true, message: "Telegram already connected." }, 200, origin);
    }

    // Delete any expired/unused codes for this user
    await db
      .from("telegram_links")
      .delete()
      .eq("user_id", userId)
      .is("chat_id", null);

    // Create new code
    const { error } = await db
      .from("telegram_links")
      .insert({ code, user_id: userId, expires_at: expiresAt });

    if (error) throw new Error(error.message);

    return json({
      code,
      expires_in: 3600,
      instructions: "Send /link " + code + " to @PerffecoAgent on Telegram",
    }, 200, origin);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Internal error";
    console.error("Telegram link error:", msg);
    return json({ error: msg }, 500, origin);
  }
};
