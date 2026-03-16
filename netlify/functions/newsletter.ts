import type { Handler, HandlerEvent } from "@netlify/functions";
import { Resend } from "resend";
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

const WELCOME_EMAIL = `
<div style="max-width:600px;margin:0 auto;background:#000000;color:#E8E8E8;font-family:'Inter',Arial,sans-serif;padding:0">
  <div style="padding:40px 32px;text-align:center;border-bottom:1px solid #1a2030">
    <div style="font-size:24px;font-weight:800;color:#FF8200;margin-bottom:4px">Perffeco</div>
    <div style="font-size:11px;color:#556677;letter-spacing:2px;text-transform:uppercase">AI Cost Intelligence</div>
  </div>
  <div style="padding:32px">
    <h1 style="font-size:22px;font-weight:800;color:#E8E8E8;margin:0 0 16px">Welcome to the AI Cost Index</h1>
    <p style="color:#B0B8C4;font-size:14px;line-height:1.7;margin:0 0 24px">
      Every Monday, you'll get the week's biggest AI pricing changes — which models got cheaper, GPU price drops, and one FinOps tip that saves real money.
    </p>
    <div style="background:#0a0e12;border:1px solid #1a2030;border-radius:8px;padding:20px;margin:0 0 24px">
      <div style="font-size:12px;color:#FF8200;font-weight:700;text-transform:uppercase;letter-spacing:1px;margin-bottom:12px">This week's highlights</div>
      <ul style="color:#B0B8C4;font-size:13px;line-height:2;margin:0;padding-left:18px">
        <li>DeepSeek V3.2 is now the <strong style="color:#33CC66">best value LLM</strong> at $0.14/1M input tokens</li>
        <li>H100 prices dropped to <strong style="color:#33CC66">$1.49/hr</strong> on Vast.ai</li>
        <li>GPT-4o Mini is <strong style="color:#33CC66">96% cheaper</strong> than GPT-4o with 85% quality</li>
      </ul>
    </div>
    <div style="text-align:center;margin:32px 0">
      <a href="https://perffeco.com" style="display:inline-block;background:#FF8200;color:#000;padding:14px 36px;border-radius:6px;font-weight:800;font-size:15px;text-decoration:none">Open Your Dashboard</a>
    </div>
    <p style="color:#556677;font-size:12px;line-height:1.6;margin:24px 0 0">
      <strong>Quick tip:</strong> Use our "Am I Overpaying?" calculator to see how much you could save by switching models or providers. Most teams save 40-70%.
    </p>
  </div>
  <div style="padding:24px 32px;border-top:1px solid #1a2030;text-align:center">
    <p style="color:#3A4A5C;font-size:10px;margin:0">
      You're receiving this because you subscribed at perffeco.com.<br>
      <a href="https://perffeco.com" style="color:#556677">Unsubscribe</a> · <a href="https://perffeco.com" style="color:#556677">Perffeco</a>
    </p>
  </div>
</div>
`;

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
      source?: string;
      metadata?: string;
    };

    const email = body.email?.trim().toLowerCase();
    if (!email || !email.includes("@")) {
      return json({ error: "Valid email is required" }, 400, origin);
    }

    const db = getDb();

    // Store in newsletter_subscribers (upsert to avoid duplicates)
    const { error: dbError } = await db
      .from("newsletter_subscribers")
      .upsert(
        { email, source: body.source || "website", metadata: body.metadata || null },
        { onConflict: "email" }
      );

    if (dbError) {
      console.warn("DB insert warning:", dbError.message);
      // Continue anyway — still send welcome email
    }

    // Send welcome email via Resend
    const resendKey = process.env.RESEND_API_KEY;
    if (resendKey) {
      const resend = new Resend(resendKey);
      try {
        await resend.emails.send({
          from: "Perffeco <hello@perffeco.com>",
          to: email,
          subject: "Welcome to the AI Cost Index — your first briefing",
          html: WELCOME_EMAIL,
        });
      } catch (emailErr) {
        // Try fallback sender domain
        try {
          await resend.emails.send({
            from: "Perffeco <onboarding@resend.dev>",
            to: email,
            subject: "Welcome to the AI Cost Index — your first briefing",
            html: WELCOME_EMAIL,
          });
        } catch (fallbackErr) {
          console.error("Email send failed:", fallbackErr);
        }
      }
    }

    return json({ success: true, message: "Subscribed" }, 200, origin);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Internal error";
    console.error("Newsletter error:", msg);
    return json({ error: msg }, 500, origin);
  }
};
