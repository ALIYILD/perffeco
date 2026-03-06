import type { Handler, HandlerEvent } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";

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
      email?: string;
      password?: string;
    };

    const email = body.email?.trim().toLowerCase();
    const password = body.password;

    if (!email || !password) {
      return json({ error: "Email and password are required" }, 400, origin);
    }

    if (password.length < 6) {
      return json({ error: "Password must be at least 6 characters" }, 400, origin);
    }

    const url = process.env.SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !serviceKey) {
      return json({ error: "Server misconfigured" }, 500, origin);
    }

    const admin = createClient(url, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Create user with auto-confirmed email
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (error) {
      // Supabase returns 422 for duplicate emails
      const status = error.message.includes("already been registered") ? 409 : 400;
      return json({ error: error.message }, status, origin);
    }

    return json({
      user: { id: data.user.id, email: data.user.email },
      message: "Account created successfully. You can now sign in.",
    }, 201, origin);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Internal error";
    console.error("Signup error:", msg);
    return json({ error: msg }, 500, origin);
  }
};
