import type { Handler, HandlerEvent } from "@netlify/functions";
import { getDb } from "./lib/supabase.js";

function json(body: unknown, status = 200) {
  return { statusCode: status, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
}

export const handler: Handler = async (event: HandlerEvent) => {
  if (event.httpMethod !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const { user_id, name } = JSON.parse(event.body ?? "{}");
    if (!user_id || !name?.trim()) return json({ error: "user_id and name are required" }, 400);

    const db = getDb();

    // Check user has team+ plan
    const { data: profile } = await db.from("profiles").select("plan, team_id").eq("id", user_id).single();
    if (!profile) return json({ error: "User not found" }, 404);

    const plan = profile.plan ?? "free";
    if (plan !== "team" && plan !== "enterprise") {
      return json({ error: "Team creation requires a Team or Enterprise plan." }, 403);
    }

    // Check user doesn't already own a team
    if (profile.team_id) {
      return json({ error: "You are already part of a team. Leave your current team first." }, 409);
    }

    const maxSeats = plan === "enterprise" ? 999 : 10;

    // Create team
    const { data: team, error: teamErr } = await db
      .from("teams")
      .insert({ name: name.trim(), owner_id: user_id, plan, max_seats: maxSeats })
      .select("id, name, plan, max_seats")
      .single();

    if (teamErr) return json({ error: teamErr.message }, 500);

    // Add owner as team member
    await db.from("team_members").insert({
      team_id: team.id,
      user_id,
      role: "owner",
      joined_at: new Date().toISOString(),
    });

    // Set profile.team_id
    await db.from("profiles").update({ team_id: team.id }).eq("id", user_id);

    return json({ team });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Internal error";
    console.error("team-create error:", msg);
    return json({ error: msg }, 500);
  }
};
