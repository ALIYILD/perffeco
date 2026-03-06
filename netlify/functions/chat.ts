import type { Handler, HandlerEvent } from "@netlify/functions";
import { runAgent, getOrCreateSession, appendMessage, ChatMessage } from "./lib/groq-agent.js";
import { getDb } from "./lib/supabase.js";

function corsHeaders(origin?: string) {
  const allowed = ["https://perffeco.com", "http://localhost:8888"];
  const o = origin && allowed.includes(origin) ? origin : allowed[0];
  return {
    "Access-Control-Allow-Origin": o,
    "Access-Control-Allow-Headers": "Content-Type",
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

export const handler: Handler = async (event: HandlerEvent) => {
  const origin = event.headers["origin"] ?? event.headers["Origin"];

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: corsHeaders(origin), body: "" };
  }

  if (event.httpMethod !== "POST") {
    return json({ error: "Method not allowed" }, 405, origin);
  }

  try {
    const body = JSON.parse(event.body ?? "{}") as {
      message?: string;
      session_id?: string;
      user_id?: string;
    };

    const message = body.message?.trim();
    if (!message) {
      return json({ error: "message is required" }, 400, origin);
    }

    // Rate limiting for authenticated users
    if (body.user_id) {
      const db = getDb();
      const PLAN_LIMITS: Record<string, number> = {
        free: 5,
        pro: 50,
        team: 200,
        enterprise: 0, // unlimited
      };

      const { data: profile } = await db
        .from("profiles")
        .select("plan, team_id")
        .eq("id", body.user_id)
        .single();

      // Team plan overrides user plan
      let plan = profile?.plan || "free";
      if (profile?.team_id) {
        const { data: team } = await db
          .from("teams")
          .select("plan")
          .eq("id", profile.team_id)
          .single();
        if (team?.plan) plan = team.plan;
      }
      const limit = PLAN_LIMITS[plan] ?? 5;

      if (limit > 0) {
        const { data: rlResult, error: rlError } = await db.rpc(
          "check_and_increment_rate_limit",
          { p_user_id: body.user_id, p_limit: limit },
        );

        if (rlError) {
          console.error("Rate limit check failed:", rlError.message);
        } else if (rlResult === false) {
          return json(
            {
              error: `Daily message limit reached (${limit}/day on ${plan} plan). Upgrade your plan for more messages.`,
            },
            429,
            origin,
          );
        }
      }
    }

    // Use session_id or generate one
    const sessionId = body.session_id || `web_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    // Get or create session
    const session = await getOrCreateSession(sessionId, "web");
    if (!session) {
      return json({ error: "Failed to create session" }, 500, origin);
    }

    // Run agent with conversation history
    const history = (session.messages as ChatMessage[]) ?? [];
    const response = await runAgent(message, history, body.user_id);

    // Save messages
    await appendMessage(session.id, "user", message);
    await appendMessage(session.id, "assistant", response);

    return json({
      response,
      session_id: session.chat_id,
    }, 200, origin);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Internal error";
    console.error("Chat error:", msg);
    return json({ error: msg }, 500, origin);
  }
};
