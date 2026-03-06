import type { Handler, HandlerEvent } from "@netlify/functions";
import { getDb } from "./lib/supabase.js";
import { runAgent, getOrCreateSession, appendMessage, ChatMessage } from "./lib/groq-agent.js";

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? "";

async function sendTelegramMessage(chatId: string, text: string) {
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "Markdown",
    }),
  });
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
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method not allowed" };
  }

  // Verify webhook secret if configured
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (secret && event.headers["x-telegram-bot-api-secret-token"] !== secret) {
    return { statusCode: 403, body: "Forbidden" };
  }

  if (!BOT_TOKEN) {
    return { statusCode: 500, body: "Bot token not configured" };
  }

  try {
    const update = JSON.parse(event.body ?? "{}");
    const message = update.message;
    if (!message?.text || !message?.chat?.id) {
      return { statusCode: 200, body: "OK" };
    }

    const chatId = String(message.chat.id);
    const text = message.text.trim();
    const db = getDb();

    // /start command
    if (text === "/start") {
      await sendTelegramMessage(
        chatId,
        "Welcome to *Perffeco AI Agent*! 🔷\n\n" +
          "I help you query AI model economics — LLM pricing, GPU costs, benchmarks, and more.\n\n" +
          "*Commands:*\n" +
          "• `/link CODE` — Link your Perffeco account (get code from dashboard)\n" +
          "• Just type naturally — \"Compare H100 vs A100 costs\"\n\n" +
          "Try asking: _What's the cheapest model for 128K context?_"
      );
      return { statusCode: 200, body: "OK" };
    }

    // /link command
    if (text.startsWith("/link")) {
      const code = text.split(/\s+/)[1]?.toUpperCase();
      if (!code) {
        await sendTelegramMessage(chatId, "Usage: `/link CODE`\n\nGet your code from the Perffeco dashboard → Connect Telegram.");
        return { statusCode: 200, body: "OK" };
      }

      const { data: link, error } = await db
        .from("telegram_links")
        .select("*")
        .eq("code", code)
        .is("chat_id", null)
        .gt("expires_at", new Date().toISOString())
        .single();

      if (error || !link) {
        await sendTelegramMessage(chatId, "Invalid or expired code. Generate a new one from the Perffeco dashboard.");
        return { statusCode: 200, body: "OK" };
      }

      await db
        .from("telegram_links")
        .update({ chat_id: chatId })
        .eq("id", link.id);

      await sendTelegramMessage(
        chatId,
        "Account linked! ✅\n\nI can now access your Perffeco data, create price alerts, and send you notifications."
      );
      return { statusCode: 200, body: "OK" };
    }

    // Natural language — route through AI agent
    // Check if user is linked
    const { data: linkData } = await db
      .from("telegram_links")
      .select("user_id")
      .eq("chat_id", chatId)
      .not("chat_id", "is", null)
      .limit(1)
      .single();

    const userId = linkData?.user_id ?? undefined;

    // Get or create session
    const session = await getOrCreateSession(chatId, "telegram", userId);
    if (!session) {
      await sendTelegramMessage(chatId, "Sorry, I couldn't start a session. Please try again.");
      return { statusCode: 200, body: "OK" };
    }

    // Run agent
    const history = (session.messages as ChatMessage[]) ?? [];
    const response = await runAgent(text, history, userId);

    // Save messages
    await appendMessage(session.id, "user", text);
    await appendMessage(session.id, "assistant", response);

    await sendTelegramMessage(chatId, response);

    return { statusCode: 200, body: "OK" };
  } catch (err) {
    console.error("Telegram webhook error:", err);
    return { statusCode: 200, body: "OK" }; // Always 200 to avoid Telegram retries
  }
};
