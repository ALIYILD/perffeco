import Groq from "groq-sdk";
import { getDb } from "./supabase.js";

const SYSTEM_PROMPT = `You are Perffeco AI Agent. You help users query AI model economics data — LLM API pricing, GPU cloud costs, training expenses, and benchmarks.

You have access to real data about:
- LLM API pricing (input/output per 1M tokens) for 60+ models across OpenAI, Anthropic, Google, Mistral, xAI, DeepSeek
- GPU cloud pricing across 15+ providers (Lambda, CoreWeave, RunPod, etc.)
- Benchmark scores (MMLU, GPQA, HLE, SWE-bench, Arena Elo)
- AI agent development costs and ROI metrics

If the user's account is linked, you can fetch their personalized data and create price alerts.

Be concise, technical but accessible. Use numbers and comparisons. Format prices as $/1M tokens for LLM APIs and $/hr for GPUs.`;

const TOOLS: Groq.Chat.Completions.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "get_model_comparison",
      description: "Compare pricing and specs of two AI models. Returns cost per 1M tokens (input/output), context window, benchmark scores, and provider.",
      parameters: {
        type: "object",
        properties: {
          model_a: { type: "string", description: "First model name, e.g. 'GPT-4o' or 'Claude Sonnet 4'" },
          model_b: { type: "string", description: "Second model name, e.g. 'Gemini 2.5 Pro' or 'DeepSeek V3'" },
        },
        required: ["model_a", "model_b"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_gpu_comparison",
      description: "Compare two GPU types across cloud providers. Returns hourly pricing, VRAM, and availability.",
      parameters: {
        type: "object",
        properties: {
          gpu_a: { type: "string", description: "First GPU, e.g. 'H100' or 'A100'" },
          gpu_b: { type: "string", description: "Second GPU, e.g. 'A100' or 'L40S'" },
        },
        required: ["gpu_a", "gpu_b"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_price_alert",
      description: "Create a price alert for a model. Notifies user when price drops below or rises above threshold.",
      parameters: {
        type: "object",
        properties: {
          model_name: { type: "string", description: "Model to watch, e.g. 'DeepSeek V3'" },
          threshold: { type: "number", description: "Price threshold in $/1M tokens" },
          condition: { type: "string", enum: ["below", "above"], description: "Alert when price goes below or above threshold" },
        },
        required: ["model_name", "threshold", "condition"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_upgrade_link",
      description: "Get the Perffeco Pro subscription upgrade link for the user.",
      parameters: { type: "object", properties: {} },
    },
  },
];

// Embedded pricing data (same as index.html)
const LLM_DATA = [
  { name: "Mistral Nemo", provider: "mistral", input: 0.02, output: 0.04, context: "131K", tier: "Budget" },
  { name: "DeepSeek V3.2", provider: "deepseek", input: 0.14, output: 0.28, context: "128K", tier: "Budget" },
  { name: "Gemini 2.0 Flash", provider: "google", input: 0.10, output: 0.40, context: "1M", tier: "Budget" },
  { name: "GPT-4o Mini", provider: "openai", input: 0.15, output: 0.60, context: "128K", tier: "Budget" },
  { name: "Claude Haiku 4.5", provider: "anthropic", input: 1.00, output: 5.00, context: "200K", tier: "Mid" },
  { name: "Gemini 2.5 Pro", provider: "google", input: 1.25, output: 10.00, context: "1M", tier: "Mid" },
  { name: "GPT-5", provider: "openai", input: 1.25, output: 10.00, context: "400K", tier: "Mid" },
  { name: "Claude Sonnet 4.6", provider: "anthropic", input: 3.00, output: 15.00, context: "200K", tier: "Mid" },
  { name: "Grok 3", provider: "xai", input: 3.00, output: 15.00, context: "131K", tier: "Mid" },
  { name: "GPT-4.5", provider: "openai", input: 75.00, output: 150.00, context: "128K", tier: "Premium" },
  { name: "Claude Opus 4.6", provider: "anthropic", input: 15.00, output: 75.00, context: "200K", tier: "Premium" },
];

const GPU_DATA = [
  { name: "H100 SXM", vram: "80GB", providers: [{ name: "Lambda", price: 2.49 }, { name: "CoreWeave", price: 2.23 }, { name: "RunPod", price: 3.29 }] },
  { name: "A100 SXM", vram: "80GB", providers: [{ name: "Lambda", price: 1.29 }, { name: "CoreWeave", price: 1.22 }, { name: "RunPod", price: 1.64 }] },
  { name: "L40S", vram: "48GB", providers: [{ name: "Lambda", price: 0.99 }, { name: "RunPod", price: 0.89 }] },
  { name: "A10G", vram: "24GB", providers: [{ name: "AWS", price: 1.01 }, { name: "RunPod", price: 0.37 }] },
  { name: "H200 SXM", vram: "141GB", providers: [{ name: "CoreWeave", price: 3.49 }, { name: "Lambda", price: 3.99 }] },
];

function findModel(query: string) {
  const q = query.toLowerCase().replace(/[-\s.]/g, "");
  return LLM_DATA.find((m) => m.name.toLowerCase().replace(/[-\s.]/g, "").includes(q));
}

function findGpu(query: string) {
  const q = query.toLowerCase().replace(/[-\s]/g, "");
  return GPU_DATA.find((g) => g.name.toLowerCase().replace(/[-\s]/g, "").includes(q));
}

async function executeToolCall(
  name: string,
  args: Record<string, unknown>,
  userId?: string
): Promise<string> {
  const db = getDb();

  if (name === "get_model_comparison") {
    const a = findModel(args.model_a as string);
    const b = findModel(args.model_b as string);
    if (!a && !b) return "Neither model found in our database. Try names like 'GPT-4o', 'Claude Sonnet 4', 'Gemini 2.5 Pro', 'DeepSeek V3'.";
    if (!a) return `Model "${args.model_a}" not found. Available: ${LLM_DATA.map((m) => m.name).join(", ")}`;
    if (!b) return `Model "${args.model_b}" not found. Available: ${LLM_DATA.map((m) => m.name).join(", ")}`;
    return JSON.stringify({
      [a.name]: { provider: a.provider, input: `$${a.input}/1M tokens`, output: `$${a.output}/1M tokens`, context: a.context, tier: a.tier },
      [b.name]: { provider: b.provider, input: `$${b.input}/1M tokens`, output: `$${b.output}/1M tokens`, context: b.context, tier: b.tier },
      savings: `${a.name} is ${a.input < b.input ? "cheaper" : "more expensive"} on input by ${Math.abs(((a.input - b.input) / Math.max(a.input, b.input)) * 100).toFixed(0)}%`,
    });
  }

  if (name === "get_gpu_comparison") {
    const a = findGpu(args.gpu_a as string);
    const b = findGpu(args.gpu_b as string);
    if (!a && !b) return "Neither GPU found. Try: H100, A100, L40S, A10G, H200.";
    if (!a) return `GPU "${args.gpu_a}" not found. Available: ${GPU_DATA.map((g) => g.name).join(", ")}`;
    if (!b) return `GPU "${args.gpu_b}" not found. Available: ${GPU_DATA.map((g) => g.name).join(", ")}`;
    return JSON.stringify({
      [a.name]: { vram: a.vram, pricing: a.providers.map((p) => `${p.name}: $${p.price}/hr`).join(", ") },
      [b.name]: { vram: b.vram, pricing: b.providers.map((p) => `${p.name}: $${p.price}/hr`).join(", ") },
    });
  }

  if (name === "create_price_alert") {
    if (!userId) return "You need to link your account first to create price alerts. Use /link in Telegram or sign in on the website.";
    const { data, error } = await db.from("price_alerts").insert({
      user_id: userId,
      model_name: args.model_name as string,
      threshold: args.threshold as number,
      condition: args.condition as string,
    }).select("id").single();
    if (error) return `Failed to create alert: ${error.message}`;
    return `Price alert created (ID: ${data.id}). You'll be notified when ${args.model_name} goes ${args.condition} $${args.threshold}/1M tokens.`;
  }

  if (name === "get_upgrade_link") {
    return "Upgrade to Perffeco Pro at https://perffeco.com — click 'Go Pro' or visit the Pricing section. Pro includes daily data updates, all calculators, CSV export, and live API data for $29/month.";
  }

  return "Unknown function.";
}

export interface ChatMessage {
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  tool_call_id?: string;
}

export async function runAgent(
  userMessage: string,
  history: ChatMessage[],
  userId?: string
): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return "Perffeco AI Agent is not configured yet. Please set GROQ_API_KEY.";

  const groq = new Groq({ apiKey });

  // Filter history to only valid user/assistant messages with non-empty content
  const safeHistory = history
    .filter((m) => (m.role === "user" || m.role === "assistant") && m.content && m.content.trim() !== "")
    .slice(-20);

  const messages: Groq.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: "system", content: SYSTEM_PROMPT },
    ...safeHistory.map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    })),
    { role: "user", content: userMessage },
  ];

  try {
    const response = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages,
      tools: TOOLS,
      tool_choice: "auto",
      max_tokens: 1024,
      temperature: 0.7,
    });

    const choice = response.choices[0];
    if (!choice) return "No response generated.";

    // Handle tool calls
    if (choice.message.tool_calls && choice.message.tool_calls.length > 0) {
      const toolMessages: Groq.Chat.Completions.ChatCompletionMessageParam[] = [
        ...messages,
        choice.message,
      ];

      for (const toolCall of choice.message.tool_calls) {
        const args = JSON.parse(toolCall.function.arguments);
        const result = await executeToolCall(toolCall.function.name, args, userId);
        toolMessages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: result,
        });
      }

      // Get final response with tool results
      const finalResponse = await groq.chat.completions.create({
        model: "llama-3.3-70b-versatile",
        messages: toolMessages,
        max_tokens: 1024,
        temperature: 0.7,
      });

      return finalResponse.choices[0]?.message?.content ?? "No response.";
    }

    return choice.message.content ?? "No response.";
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("Groq agent error:", msg);
    console.error("History length:", history.length, "Safe history:", safeHistory.length);
    return `Sorry, I encountered an error. Please try again.`;
  }
}

export async function getOrCreateSession(
  chatId: string,
  platform: "telegram" | "web",
  userId?: string
) {
  const db = getDb();
  const { data } = await db
    .from("chat_sessions")
    .select("*")
    .eq("chat_id", chatId)
    .eq("platform", platform)
    .order("updated_at", { ascending: false })
    .limit(1)
    .single();

  if (data) return data;

  const { data: newSession } = await db
    .from("chat_sessions")
    .insert({ chat_id: chatId, platform, user_id: userId, messages: [] })
    .select()
    .single();

  return newSession;
}

export async function appendMessage(
  sessionId: string,
  role: "user" | "assistant",
  content: string
) {
  const db = getDb();
  const { data: session } = await db
    .from("chat_sessions")
    .select("messages")
    .eq("id", sessionId)
    .single();

  const messages = (session?.messages as ChatMessage[]) ?? [];
  messages.push({ role, content });

  // Keep last 50 messages
  const trimmed = messages.slice(-50);

  await db
    .from("chat_sessions")
    .update({ messages: trimmed, updated_at: new Date().toISOString() })
    .eq("id", sessionId);
}
