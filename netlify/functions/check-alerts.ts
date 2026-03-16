import type { Config } from "@netlify/functions";
import { Resend } from "resend";
import { getDb } from "./lib/supabase.js";
import { LLM_DATA, findModel } from "./lib/data.js";
import { logUsage } from "./lib/usage.js";

const TELEGRAM_API = "https://api.telegram.org/bot";

async function sendAlertEmail(to: string, modelName: string, currentPrice: string, condition: string, threshold: string): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return false;
  const resend = new Resend(key);
  const direction = condition === "below" ? "dropped below" : "risen above";
  try {
    await resend.emails.send({
      from: "Perffeco <hello@perffeco.com>",
      to,
      subject: `Price Alert: ${modelName} has ${direction} $${threshold}/1M tokens`,
      html: `<div style="max-width:600px;margin:0 auto;background:#000;color:#E8E8E8;font-family:Arial,sans-serif;padding:32px">
        <div style="font-size:24px;font-weight:800;color:#FF8200;margin-bottom:24px">Perffeco</div>
        <h2 style="margin:0 0 16px">Price Alert Triggered</h2>
        <div style="background:#0a0e12;border:1px solid #1a2030;border-radius:8px;padding:20px;margin:0 0 24px">
          <div style="font-size:18px;font-weight:800;color:#E8E8E8">${modelName}</div>
          <div style="font-size:32px;font-weight:800;color:#FF8200;margin:8px 0">$${currentPrice}/1M tokens</div>
          <div style="color:#33CC66;font-size:14px">Has ${direction} your $${threshold} threshold</div>
        </div>
        <div style="text-align:center;margin:24px 0">
          <a href="https://perffeco.com" style="display:inline-block;background:#FF8200;color:#000;padding:14px 32px;border-radius:6px;font-weight:800;font-size:15px;text-decoration:none">View Full Pricing Dashboard</a>
        </div>
        <p style="color:#556677;font-size:11px;margin-top:32px">You set this alert on Perffeco. To manage your alerts, visit your account settings.</p>
      </div>`,
    });
    return true;
  } catch {
    try {
      await resend.emails.send({
        from: "Perffeco <onboarding@resend.dev>",
        to,
        subject: `Price Alert: ${modelName} has ${direction} $${threshold}/1M tokens`,
        html: `<p>${modelName} is now $${currentPrice}/1M tokens (blended), which has ${direction} your $${threshold} threshold.</p><p><a href="https://perffeco.com">View Dashboard</a></p>`,
      });
      return true;
    } catch (e) {
      console.error("Alert email failed:", e);
      return false;
    }
  }
}

async function sendTelegram(chatId: string, text: string): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return false;

  try {
    const res = await fetch(`${TELEGRAM_API}${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: "Markdown" }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export default async function handler() {
  const db = getDb();

  // Fetch all active alerts
  const { data: alerts, error } = await db
    .from("price_alerts")
    .select("id, user_id, model_name, threshold, condition, active, last_notified_at")
    .eq("active", true);

  if (error || !alerts?.length) {
    console.log("No active alerts or error:", error?.message);
    return new Response(JSON.stringify({ checked: 0 }), { status: 200 });
  }

  let triggered = 0;
  const now = new Date();

  for (const alert of alerts) {
    // Skip if notified in last 24 hours
    if (alert.last_notified_at) {
      const lastNotified = new Date(alert.last_notified_at);
      if (now.getTime() - lastNotified.getTime() < 24 * 60 * 60 * 1000) continue;
    }

    // Find current price for the model
    const model = findModel(alert.model_name);
    if (!model) continue;

    // Use blended price (avg of input + output)
    const currentPrice = (model.input + model.output) / 2;
    let shouldTrigger = false;

    if (alert.condition === "below" && currentPrice < alert.threshold) {
      shouldTrigger = true;
    } else if (alert.condition === "above" && currentPrice > alert.threshold) {
      shouldTrigger = true;
    }

    if (!shouldTrigger) continue;

    triggered++;

    // Check if user has Telegram linked
    const { data: tgLink } = await db
      .from("telegram_links")
      .select("chat_id")
      .eq("user_id", alert.user_id)
      .not("chat_id", "is", null)
      .limit(1)
      .single();

    let channel: "telegram" | "email" | "in_app" = "in_app";
    const alertMsg = `Price Alert: ${model.name} is now $${currentPrice.toFixed(2)}/1M tokens (blended), which is ${alert.condition} your $${alert.threshold}/1M threshold.`;

    if (tgLink?.chat_id) {
      const sent = await sendTelegram(tgLink.chat_id, `🔔 *${alertMsg}*`);
      if (sent) channel = "telegram";
    }

    // Send email alert
    const { data: userProfile } = await db.from("profiles").select("email").eq("id", alert.user_id).single();
    if (userProfile?.email) {
      const emailSent = await sendAlertEmail(
        userProfile.email,
        model.name,
        currentPrice.toFixed(2),
        alert.condition,
        alert.threshold.toString()
      );
      if (emailSent && channel === "in_app") channel = "email";
    }

    // Always create in-app notification
    await db.from("in_app_notifications").insert({
      user_id: alert.user_id,
      type: "alert",
      title: "Price Alert Triggered",
      body: alertMsg,
      metadata: { alert_id: alert.id, model_name: model.name, current_price: currentPrice },
    });

    // Log usage — resolve team_id from profile
    const { data: alertProfile } = await db.from("profiles").select("team_id").eq("id", alert.user_id).single();
    if (alertProfile?.team_id) {
      logUsage(alertProfile.team_id, alert.user_id, "alert_trigger");
    }

    // Record in alert_history
    await db.from("alert_history").insert({
      alert_id: alert.id,
      user_id: alert.user_id,
      model_name: model.name,
      current_price: currentPrice,
      threshold: alert.threshold,
      condition: alert.condition,
      channel,
    });

    // Update last_notified_at
    await db.from("price_alerts").update({ last_notified_at: now.toISOString() }).eq("id", alert.id);
  }

  console.log(`Alert check complete: ${alerts.length} alerts, ${triggered} triggered`);
  return new Response(JSON.stringify({ checked: alerts.length, triggered }), { status: 200 });
}

export const config: Config = {
  schedule: "0 8 * * *", // Daily at 08:00 UTC
};
