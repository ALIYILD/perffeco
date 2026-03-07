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
  // Budget
  "mistralai/mistral-nemo": { name: "Mistral Nemo", provider: "mistral", context: "131K", tier: "Budget" },
  "mistralai/mistral-small-2501": { name: "Mistral Small", provider: "mistral", context: "32K", tier: "Budget" },
  "deepseek/deepseek-chat": { name: "DeepSeek V3.2", provider: "deepseek", context: "128K", tier: "Budget" },
  "google/gemini-2.0-flash-001": { name: "Gemini 2.0 Flash", provider: "google", context: "1M", tier: "Budget" },
  "google/gemma-3-27b-it": { name: "Gemma 3 27B", provider: "google", context: "128K", tier: "Budget" },
  "openai/gpt-4o-mini": { name: "GPT-4o Mini", provider: "openai", context: "128K", tier: "Budget" },
  "meta-llama/llama-4-scout": { name: "Llama 4 Scout", provider: "meta", context: "512K", tier: "Budget" },
  "qwen/qwen3-32b": { name: "Qwen3 32B", provider: "alibaba", context: "128K", tier: "Budget" },
  // Mid
  "deepseek/deepseek-r1": { name: "DeepSeek R1", provider: "deepseek", context: "128K", tier: "Mid" },
  "anthropic/claude-3.5-haiku": { name: "Claude Haiku 4.5", provider: "anthropic", context: "200K", tier: "Mid" },
  "google/gemini-2.5-pro-preview": { name: "Gemini 2.5 Pro", provider: "google", context: "1M", tier: "Mid" },
  "openai/gpt-5": { name: "GPT-5", provider: "openai", context: "400K", tier: "Mid" },
  "openai/gpt-4o": { name: "GPT-4o", provider: "openai", context: "128K", tier: "Mid" },
  "meta-llama/llama-4-maverick": { name: "Llama 4 Maverick", provider: "meta", context: "256K", tier: "Mid" },
  "x-ai/grok-3": { name: "Grok 3", provider: "xai", context: "131K", tier: "Mid" },
  "x-ai/grok-3-mini": { name: "Grok 3 Mini", provider: "xai", context: "131K", tier: "Mid" },
  "anthropic/claude-sonnet-4": { name: "Claude Sonnet 4.6", provider: "anthropic", context: "200K", tier: "Mid" },
  "mistralai/mistral-large-2411": { name: "Mistral Large", provider: "mistral", context: "128K", tier: "Mid" },
  "qwen/qwen3-235b-a22b": { name: "Qwen3 235B", provider: "alibaba", context: "128K", tier: "Mid" },
  // Premium
  "anthropic/claude-opus-4": { name: "Claude Opus 4.6", provider: "anthropic", context: "200K", tier: "Premium" },
  "openai/o3-pro": { name: "o3 Pro", provider: "openai", context: "200K", tier: "Premium" },
  "openai/gpt-4.5-preview": { name: "GPT-4.5", provider: "openai", context: "128K", tier: "Premium" },
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
const GPU_TYPES = ["H100", "A100", "L40S", "H200", "B200", "RTX 4090", "RTX 6000"];

// Static hyperscaler prices (don't change frequently)
const HYPERSCALER_ROWS = [
  // H100
  { gpu: "H100 SXM", vram: "80GB", provider: "GCP", onDemand: 3.67, spot: "$2.25", type: "Hyper" },
  { gpu: "H100 SXM", vram: "80GB", provider: "AWS", onDemand: 3.93, spot: "$1.18", type: "Hyper" },
  { gpu: "H100 SXM", vram: "80GB", provider: "Azure", onDemand: 6.98, spot: "$4.89", type: "Hyper" },
  { gpu: "H100 SXM", vram: "80GB", provider: "Lambda", onDemand: 2.49, spot: "\u2014", type: "Market" },
  { gpu: "H100 SXM", vram: "80GB", provider: "CoreWeave", onDemand: 2.23, spot: "\u2014", type: "Market" },
  { gpu: "H100 SXM", vram: "80GB", provider: "RunPod", onDemand: 3.29, spot: "$1.99", type: "Market" },
  { gpu: "H100 SXM", vram: "80GB", provider: "FluidStack", onDemand: 2.15, spot: "\u2014", type: "Market" },
  { gpu: "H100 SXM", vram: "80GB", provider: "TensorDock", onDemand: 2.59, spot: "\u2014", type: "Market" },
  // A100
  { gpu: "A100 SXM", vram: "80GB", provider: "Lambda", onDemand: 1.29, spot: "\u2014", type: "Market" },
  { gpu: "A100 SXM", vram: "80GB", provider: "CoreWeave", onDemand: 1.22, spot: "\u2014", type: "Market" },
  { gpu: "A100 SXM", vram: "80GB", provider: "RunPod", onDemand: 1.64, spot: "$0.89", type: "Market" },
  { gpu: "A100 SXM", vram: "80GB", provider: "FluidStack", onDemand: 1.10, spot: "\u2014", type: "Market" },
  { gpu: "A100 SXM", vram: "80GB", provider: "GCP", onDemand: 3.67, spot: "$1.10", type: "Hyper" },
  { gpu: "A100 SXM", vram: "80GB", provider: "AWS", onDemand: 3.40, spot: "$1.02", type: "Hyper" },
  // H200
  { gpu: "H200 SXM", vram: "141GB", provider: "CoreWeave", onDemand: 3.49, spot: "\u2014", type: "Market" },
  { gpu: "H200 SXM", vram: "141GB", provider: "Lambda", onDemand: 3.99, spot: "\u2014", type: "Market" },
  { gpu: "H200 SXM", vram: "141GB", provider: "RunPod", onDemand: 3.89, spot: "$2.49", type: "Market" },
  // B200
  { gpu: "B200", vram: "192GB", provider: "Lambda", onDemand: 2.99, spot: "\u2014", type: "Special" },
  { gpu: "B200", vram: "192GB", provider: "CoreWeave", onDemand: 3.29, spot: "\u2014", type: "Special" },
  // L40S
  { gpu: "L40S", vram: "48GB", provider: "Lambda", onDemand: 0.99, spot: "\u2014", type: "Market" },
  { gpu: "L40S", vram: "48GB", provider: "RunPod", onDemand: 0.89, spot: "$0.44", type: "Market" },
  { gpu: "L40S", vram: "48GB", provider: "TensorDock", onDemand: 0.79, spot: "\u2014", type: "Market" },
  { gpu: "L40S", vram: "48GB", provider: "FluidStack", onDemand: 0.85, spot: "\u2014", type: "Market" },
  // RTX
  { gpu: "RTX 4090", vram: "24GB", provider: "RunPod", onDemand: 0.44, spot: "$0.29", type: "Market" },
  { gpu: "RTX 4090", vram: "24GB", provider: "TensorDock", onDemand: 0.34, spot: "\u2014", type: "Market" },
  { gpu: "RTX 6000 Ada", vram: "48GB", provider: "RunPod", onDemand: 0.69, spot: "$0.39", type: "Market" },
];

const VRAM_MAP: Record<string, string> = {
  H100: "80GB",
  A100: "80GB",
  L40S: "48GB",
  H200: "141GB",
  B200: "192GB",
  "RTX 4090": "24GB",
  "RTX 6000": "48GB",
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
