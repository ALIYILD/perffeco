import type { Config } from "@netlify/functions";
import { getDb } from "./lib/supabase.js";
import { LLM_DATA, findModel } from "./lib/data.js";
import { logUsage } from "./lib/usage.js";

const TELEGRAM_API = "https://api.telegram.org/bot";

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

    let channel: "telegram" | "in_app" = "in_app";
    const alertMsg = `Price Alert: ${model.name} is now $${currentPrice.toFixed(2)}/1M tokens (blended), which is ${alert.condition} your $${alert.threshold}/1M threshold.`;

    if (tgLink?.chat_id) {
      const sent = await sendTelegram(tgLink.chat_id, `🔔 *${alertMsg}*`);
      if (sent) channel = "telegram";
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
