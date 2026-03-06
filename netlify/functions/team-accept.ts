import type { Handler, HandlerEvent } from "@netlify/functions";
import { getDb } from "./lib/supabase.js";

function json(body: unknown, status = 200) {
  return { statusCode: status, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
}

export const handler: Handler = async (event: HandlerEvent) => {
  if (event.httpMethod !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const { user_id, token } = JSON.parse(event.body ?? "{}");
    if (!user_id || !token) return json({ error: "user_id and token are required" }, 400);

    const db = getDb();

    // Look up invite
    const { data: invite } = await db
      .from("team_members")
      .select("id, team_id, invite_email, joined_at")
      .eq("invite_token", token)
      .single();

    if (!invite) return json({ error: "Invalid or expired invite token." }, 404);
    if (invite.joined_at) return json({ error: "This invite has already been used." }, 409);

    // Verify email matches
    const { data: user } = await db.from("auth.users").select("email").eq("id", user_id).single();
    // Fallback: get email from profile or auth
    let userEmail = user?.email;
    if (!userEmail) {
      // Try to get from Supabase auth admin
      const { data: { user: authUser } } = await db.auth.admin.getUserById(user_id);
      userEmail = authUser?.email;
    }

    if (invite.invite_email && userEmail && invite.invite_email !== userEmail.toLowerCase()) {
      return json({ error: "This invite was sent to a different email address." }, 403);
    }

    // Check user isn't already in a team
    const { data: profile } = await db.from("profiles").select("team_id").eq("id", user_id).single();
    if (profile?.team_id) {
      return json({ error: "You are already part of a team. Leave your current team first." }, 409);
    }

    // Accept: update team_member row
    await db
      .from("team_members")
      .update({
        user_id,
        joined_at: new Date().toISOString(),
        invite_token: null, // Clear token after use
      })
      .eq("id", invite.id);

    // Set profile.team_id
    await db.from("profiles").update({ team_id: invite.team_id }).eq("id", user_id);

    // Get team name for confirmation
    const { data: team } = await db.from("teams").select("name").eq("id", invite.team_id).single();

    return json({ success: true, team_name: team?.name ?? "Team" });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Internal error";
    console.error("team-accept error:", msg);
    return json({ error: msg }, 500);
  }
};
