import { createHash, randomBytes } from "crypto";
import type { HandlerEvent } from "@netlify/functions";
import { getDb } from "./supabase.js";
import { logUsage } from "./usage.js";

const PLAN_API_LIMITS: Record<string, number> = {
  free: 0,      // no API access
  pro: 0,       // no API access
  team: 10_000, // 10K/month
  enterprise: 0, // unlimited (0 = no limit)
};

export function hashApiKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

export function generateApiKey(): string {
  return "pk_live_" + randomBytes(32).toString("hex");
}

export interface AuthResult {
  valid: boolean;
  userId?: string;
  teamId?: string;
  plan?: string;
  error?: string;
  status?: number;
}

export async function authenticateApiKey(event: HandlerEvent): Promise<AuthResult> {
  const authHeader = event.headers["authorization"] ?? event.headers["Authorization"];
  if (!authHeader?.startsWith("Bearer ")) {
    return { valid: false, error: "Missing or invalid Authorization header. Use: Bearer <api_key>", status: 401 };
  }

  const rawKey = authHeader.slice(7).trim();
  if (!rawKey.startsWith("pk_live_")) {
    return { valid: false, error: "Invalid API key format.", status: 401 };
  }

  const keyHash = hashApiKey(rawKey);
  const db = getDb();

  // Look up the key
  const { data: apiKey, error } = await db
    .from("api_keys")
    .select("id, user_id, team_id, active, calls_month, calls_month_date")
    .eq("key_hash", keyHash)
    .single();

  if (error || !apiKey) {
    return { valid: false, error: "Invalid API key.", status: 401 };
  }

  if (!apiKey.active) {
    return { valid: false, error: "API key has been revoked.", status: 401 };
  }

  // Resolve effective plan: team plan > user plan
  let plan = "free";
  if (apiKey.team_id) {
    const { data: team } = await db
      .from("teams")
      .select("plan")
      .eq("id", apiKey.team_id)
      .single();
    plan = team?.plan ?? "team";
  } else {
    const { data: profile } = await db
      .from("profiles")
      .select("plan, team_id")
      .eq("id", apiKey.user_id)
      .single();
    if (profile?.team_id) {
      const { data: team } = await db
        .from("teams")
        .select("plan")
        .eq("id", profile.team_id)
        .single();
      plan = team?.plan ?? profile?.plan ?? "free";
    } else {
      plan = profile?.plan ?? "free";
    }
  }

  // Check plan allows API access
  if (plan !== "team" && plan !== "enterprise") {
    return { valid: false, error: "API access requires a Team or Enterprise plan.", status: 403 };
  }

  // Check rate limit
  const monthlyLimit = PLAN_API_LIMITS[plan] ?? 0;
  const { data: allowed, error: rlError } = await db.rpc("check_api_rate_limit", {
    p_key_hash: keyHash,
    p_monthly_limit: monthlyLimit,
  });

  if (rlError) {
    console.error("Rate limit check failed:", rlError.message);
    return { valid: false, error: "Rate limit check failed.", status: 500 };
  }

  if (allowed === false) {
    return {
      valid: false,
      error: `Monthly API limit reached (${monthlyLimit.toLocaleString()} calls/month on ${plan} plan).`,
      status: 429,
    };
  }

  logUsage(apiKey.team_id, apiKey.user_id, "api_call");
  return { valid: true, userId: apiKey.user_id, teamId: apiKey.team_id, plan };
}
