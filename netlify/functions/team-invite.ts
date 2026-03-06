import type { Handler, HandlerEvent } from "@netlify/functions";
import { randomBytes } from "crypto";
import { getDb } from "./lib/supabase.js";

function json(body: unknown, status = 200) {
  return { statusCode: status, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
}

export const handler: Handler = async (event: HandlerEvent) => {
  if (event.httpMethod !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const { user_id, email } = JSON.parse(event.body ?? "{}");
    if (!user_id || !email?.trim()) return json({ error: "user_id and email are required" }, 400);

    const db = getDb();

    // Verify caller is owner or admin
    const { data: member } = await db
      .from("team_members")
      .select("team_id, role")
      .eq("user_id", user_id)
      .in("role", ["owner", "admin"])
      .single();

    if (!member) return json({ error: "You must be a team owner or admin to invite members." }, 403);

    // Check seat limit
    const { data: team } = await db.from("teams").select("max_seats").eq("id", member.team_id).single();
    const { count } = await db
      .from("team_members")
      .select("id", { count: "exact", head: true })
      .eq("team_id", member.team_id);

    if (team && count !== null && count >= team.max_seats) {
      return json({ error: `Team is at capacity (${team.max_seats} seats). Upgrade to add more members.` }, 403);
    }

    // Check if already invited or member
    const { data: existing } = await db
      .from("team_members")
      .select("id, joined_at")
      .eq("team_id", member.team_id)
      .eq("invite_email", email.trim().toLowerCase())
      .limit(1);

    if (existing && existing.length > 0) {
      return json({ error: "This email has already been invited." }, 409);
    }

    // Generate invite token
    const inviteToken = randomBytes(24).toString("hex");

    await db.from("team_members").insert({
      team_id: member.team_id,
      invite_email: email.trim().toLowerCase(),
      invite_token: inviteToken,
      role: "member",
    });

    const inviteLink = `https://perffeco.com/?invite=${inviteToken}`;

    return json({ invite_link: inviteLink, token: inviteToken });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Internal error";
    console.error("team-invite error:", msg);
    return json({ error: msg }, 500);
  }
};
