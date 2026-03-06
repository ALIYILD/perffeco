import type { Handler, HandlerEvent } from "@netlify/functions";
import { BENCHMARK_DATA } from "./lib/data.js";

// ---------- Types ----------
interface CacheEntry {
  data: unknown;
  ts: number;
}

// ---------- Server-side cache (2-min TTL) ----------
const cache: Record<string, CacheEntry> = {};
const CACHE_TTL = 2 * 60 * 1000; // 2 minutes

function getCached(key: string): unknown | null {
  const entry = cache[key];
  if (entry && Date.now() - entry.ts < CACHE_TTL) return entry.data;
  return null;
}

function setCache(key: string, data: unknown): void {
  cache[key] = { data, ts: Date.now() };
}

// ---------- Helpers ----------
function json(body: unknown, status = 200) {
  return {
    statusCode: status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=60",
      "Access-Control-Allow-Origin": "*",
    },
    body: JSON.stringify(body),
  };
}

async function fetchWithTimeout(url: string, opts: RequestInit = {}, timeoutMs = 10000): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...opts, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

// ---------- LLM source (OpenRouter) ----------
const OPENROUTER_MODEL_MAP: Record<string, { name: string; provider: string; context: string; tier: "Budget" | "Mid" | "Premium" }> = {
  "mistralai/mistral-nemo": { name: "Mistral Nemo", provider: "mistral", context: "131K", tier: "Budget" },
  "deepseek/deepseek-chat": { name: "DeepSeek V3.2", provider: "deepseek", context: "128K", tier: "Budget" },
  "google/gemini-2.0-flash-001": { name: "Gemini 2.0 Flash", provider: "google", context: "1M", tier: "Budget" },
  "openai/gpt-4o-mini": { name: "GPT-4o Mini", provider: "openai", context: "128K", tier: "Budget" },
  "anthropic/claude-3.5-haiku": { name: "Claude Haiku 4.5", provider: "anthropic", context: "200K", tier: "Mid" },
  "google/gemini-2.5-pro-preview": { name: "Gemini 2.5 Pro", provider: "google", context: "1M", tier: "Mid" },
  "openai/gpt-5": { name: "GPT-5", provider: "openai", context: "400K", tier: "Mid" },
  "anthropic/claude-sonnet-4": { name: "Claude Sonnet 4.6", provider: "anthropic", context: "200K", tier: "Mid" },
  "x-ai/grok-3": { name: "Grok 3", provider: "xai", context: "131K", tier: "Mid" },
  "anthropic/claude-opus-4": { name: "Claude Opus 4.6", provider: "anthropic", context: "200K", tier: "Premium" },
  "openai/o3-pro": { name: "o3 Pro", provider: "openai", context: "200K", tier: "Premium" },
};

async function fetchLLM() {
  const cached = getCached("llm");
  if (cached) return cached;

  const res = await fetchWithTimeout("https://openrouter.ai/api/v1/models");
  if (!res.ok) throw new Error(`OpenRouter returned ${res.status}`);
  const body = await res.json();

  const result: Array<{ name: string; provider: string; input: number; output: number; context: string; tier: string }> = [];

  for (const m of body.data) {
    const meta = OPENROUTER_MODEL_MAP[m.id];
    if (!meta || !m.pricing) continue;
    result.push({
      name: meta.name,
      provider: meta.provider,
      input: parseFloat(m.pricing.prompt) * 1e6,
      output: parseFloat(m.pricing.completion) * 1e6,
      context: meta.context,
      tier: meta.tier,
    });
  }

  // Sort by tier order then by input price
  const tierOrder: Record<string, number> = { Budget: 0, Mid: 1, Premium: 2 };
  result.sort((a, b) => (tierOrder[a.tier] ?? 9) - (tierOrder[b.tier] ?? 9) || a.input - b.input);

  const data = { data: result, source: "live", updated: new Date().toISOString() };
  setCache("llm", data);
  return data;
}

// ---------- GPU source (Vast.ai + static hyperscalers) ----------
const GPU_TYPES = ["H100", "A100", "L40S", "H200", "B200", "RTX 4090"];

// Static hyperscaler prices (don't change frequently)
const HYPERSCALER_ROWS = [
  { gpu: "H100 SXM", vram: "80GB", provider: "GCP", onDemand: 3.67, spot: "$2.25", type: "Hyper" },
  { gpu: "H100 SXM", vram: "80GB", provider: "AWS", onDemand: 3.93, spot: "$1.18", type: "Hyper" },
  { gpu: "H100 SXM", vram: "80GB", provider: "Azure", onDemand: 6.98, spot: "$4.89", type: "Hyper" },
  { gpu: "H100 SXM", vram: "80GB", provider: "Lambda", onDemand: 1.85, spot: "\u2014", type: "Market" },
  { gpu: "H200 SXM", vram: "141GB", provider: "Lambda", onDemand: 1.85, spot: "\u2014", type: "Market" },
  { gpu: "B200", vram: "192GB", provider: "Lambda", onDemand: 2.99, spot: "\u2014", type: "Special" },
];

const VRAM_MAP: Record<string, string> = {
  H100: "80GB",
  A100: "80GB",
  L40S: "48GB",
  H200: "141GB",
  B200: "192GB",
  "RTX 4090": "24GB",
};

async function fetchGPU() {
  const cached = getCached("gpu");
  if (cached) return cached;

  let vastRows: Array<{ gpu: string; vram: string; provider: string; onDemand: number; spot: string; type: string }> = [];

  try {
    // Fetch on-demand offers from Vast.ai
    const res = await fetchWithTimeout(
      "https://cloud.vast.ai/api/v0/bundles/?q=%7B%22rentable%22%3A%7B%22eq%22%3Atrue%7D%2C%22type%22%3A%22on-demand%22%7D&limit=1000",
      {},
      8000
    );
    if (res.ok) {
      const body = await res.json();
      const offers = body.offers || body;

      // Group by GPU type, find cheapest per type
      const cheapest: Record<string, number> = {};

      for (const offer of (Array.isArray(offers) ? offers : [])) {
        const gpuName = offer.gpu_name || "";
        for (const gpuType of GPU_TYPES) {
          if (gpuName.toUpperCase().includes(gpuType.toUpperCase().replace(" ", ""))) {
            const pricePerGpu = (offer.dph_total || 0) / (offer.num_gpus || 1);
            if (!cheapest[gpuType] || pricePerGpu < cheapest[gpuType]) {
              cheapest[gpuType] = pricePerGpu;
            }
            break;
          }
        }
      }

      for (const [gpuType, price] of Object.entries(cheapest)) {
        if (price > 0 && price < 100) {
          vastRows.push({
            gpu: gpuType === "A100" ? "A100 80GB" : gpuType === "H100" ? "H100 SXM" : gpuType === "H200" ? "H200 SXM" : gpuType,
            vram: VRAM_MAP[gpuType] || "N/A",
            provider: "Vast.ai",
            onDemand: Math.round(price * 100) / 100,
            spot: "dynamic",
            type: "Market",
          });
        }
      }
    }
  } catch (e) {
    console.warn("Vast.ai fetch failed:", e);
  }

  // Merge Vast.ai rows with hyperscaler static rows
  const allRows = [...vastRows, ...HYPERSCALER_ROWS];
  allRows.sort((a, b) => a.onDemand - b.onDemand);

  const data = {
    data: allRows,
    source: vastRows.length > 0 ? "live" : "default",
    updated: new Date().toISOString(),
  };
  setCache("gpu", data);
  return data;
}

// ---------- Benchmarks (curated) ----------
function fetchBenchmarks() {
  return {
    data: BENCHMARK_DATA,
    source: "curated",
    updated: new Date().toISOString(),
  };
}

// ---------- Handler ----------
export const handler: Handler = async (event: HandlerEvent) => {
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
      body: "",
    };
  }

  if (event.httpMethod !== "GET") return json({ error: "Method not allowed" }, 405);

  const source = event.queryStringParameters?.source;

  try {
    switch (source) {
      case "llm":
        return json(await fetchLLM());
      case "gpu":
        return json(await fetchGPU());
      case "benchmarks":
        return json(fetchBenchmarks());
      default:
        return json({ error: "Missing or invalid ?source= parameter. Use: llm, gpu, benchmarks" }, 400);
    }
  } catch (err: any) {
    console.error(`live-data [${source}] error:`, err);
    return json({ error: "Upstream fetch failed", detail: err.message }, 502);
  }
};
