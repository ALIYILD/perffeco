// Shared data module — single source of truth for LLM, GPU, and benchmark data.
// Imported by groq-agent.ts and API v1 endpoints.

export interface LLMModel {
  name: string;
  provider: string;
  input: number;   // $/1M tokens
  output: number;  // $/1M tokens
  context: string;
  tier: "Budget" | "Mid" | "Premium";
}

export interface GPUProvider {
  name: string;
  price: number; // $/hr
}

export interface GPUEntry {
  name: string;
  vram: string;
  providers: GPUProvider[];
}

export interface BenchmarkEntry {
  rank: number;
  name: string;
  arena: number;
  mmlu: number;
  gpqa: number;
  humaneval: number;
  swe: number;
  math: number;
  type: "open" | "closed";
  price: string;
}

export const LLM_DATA: LLMModel[] = [
  // Budget tier
  { name: "Mistral Nemo", provider: "mistral", input: 0.02, output: 0.04, context: "131K", tier: "Budget" },
  { name: "Gemini 2.0 Flash", provider: "google", input: 0.10, output: 0.40, context: "1M", tier: "Budget" },
  { name: "DeepSeek V3.2", provider: "deepseek", input: 0.14, output: 0.28, context: "128K", tier: "Budget" },
  { name: "GPT-4o Mini", provider: "openai", input: 0.15, output: 0.60, context: "128K", tier: "Budget" },
  { name: "Llama 4 Scout", provider: "meta", input: 0.15, output: 0.60, context: "512K", tier: "Budget" },
  { name: "Qwen3 32B", provider: "alibaba", input: 0.20, output: 0.60, context: "128K", tier: "Budget" },
  { name: "Gemma 3 27B", provider: "google", input: 0.10, output: 0.20, context: "128K", tier: "Budget" },
  { name: "Mistral Small", provider: "mistral", input: 0.10, output: 0.30, context: "32K", tier: "Budget" },
  // Mid tier
  { name: "DeepSeek R1", provider: "deepseek", input: 0.55, output: 2.19, context: "128K", tier: "Mid" },
  { name: "Claude Haiku 4.5", provider: "anthropic", input: 1.00, output: 5.00, context: "200K", tier: "Mid" },
  { name: "Gemini 2.5 Pro", provider: "google", input: 1.25, output: 10.00, context: "1M", tier: "Mid" },
  { name: "GPT-5", provider: "openai", input: 1.25, output: 10.00, context: "400K", tier: "Mid" },
  { name: "Llama 4 Maverick", provider: "meta", input: 0.50, output: 2.00, context: "256K", tier: "Mid" },
  { name: "GPT-4o", provider: "openai", input: 2.50, output: 10.00, context: "128K", tier: "Mid" },
  { name: "Grok 3", provider: "xai", input: 3.00, output: 15.00, context: "131K", tier: "Mid" },
  { name: "Grok 3 Mini", provider: "xai", input: 0.30, output: 0.50, context: "131K", tier: "Mid" },
  { name: "Claude Sonnet 4.6", provider: "anthropic", input: 3.00, output: 15.00, context: "200K", tier: "Mid" },
  { name: "Mistral Large", provider: "mistral", input: 2.00, output: 6.00, context: "128K", tier: "Mid" },
  { name: "Qwen3 235B", provider: "alibaba", input: 1.50, output: 6.00, context: "128K", tier: "Mid" },
  // Premium tier
  { name: "Claude Opus 4.6", provider: "anthropic", input: 15.00, output: 75.00, context: "200K", tier: "Premium" },
  { name: "o3 Pro", provider: "openai", input: 20.00, output: 80.00, context: "200K", tier: "Premium" },
  { name: "GPT-4.5", provider: "openai", input: 75.00, output: 150.00, context: "128K", tier: "Premium" },
];

export const GPU_DATA: GPUEntry[] = [
  { name: "H100 SXM", vram: "80GB", providers: [{ name: "Lambda", price: 2.49 }, { name: "CoreWeave", price: 2.23 }, { name: "RunPod", price: 3.29 }, { name: "Vast.ai", price: 1.49 }, { name: "TensorDock", price: 2.59 }, { name: "FluidStack", price: 2.15 }] },
  { name: "H100 PCIe", vram: "80GB", providers: [{ name: "RunPod", price: 2.39 }, { name: "TensorDock", price: 2.09 }, { name: "Vast.ai", price: 1.29 }] },
  { name: "A100 SXM", vram: "80GB", providers: [{ name: "Lambda", price: 1.29 }, { name: "CoreWeave", price: 1.22 }, { name: "RunPod", price: 1.64 }, { name: "Vast.ai", price: 0.89 }, { name: "FluidStack", price: 1.10 }] },
  { name: "A100 PCIe", vram: "40GB", providers: [{ name: "RunPod", price: 1.19 }, { name: "Vast.ai", price: 0.69 }, { name: "TensorDock", price: 0.99 }] },
  { name: "H200 SXM", vram: "141GB", providers: [{ name: "CoreWeave", price: 3.49 }, { name: "Lambda", price: 3.99 }, { name: "RunPod", price: 3.89 }] },
  { name: "B200", vram: "192GB", providers: [{ name: "Lambda", price: 2.99 }, { name: "CoreWeave", price: 3.29 }] },
  { name: "L40S", vram: "48GB", providers: [{ name: "Lambda", price: 0.99 }, { name: "RunPod", price: 0.89 }, { name: "TensorDock", price: 0.79 }, { name: "FluidStack", price: 0.85 }] },
  { name: "RTX 4090", vram: "24GB", providers: [{ name: "RunPod", price: 0.44 }, { name: "Vast.ai", price: 0.29 }, { name: "TensorDock", price: 0.34 }] },
  { name: "RTX 6000 Ada", vram: "48GB", providers: [{ name: "RunPod", price: 0.69 }, { name: "Vast.ai", price: 0.55 }] },
  { name: "A10G", vram: "24GB", providers: [{ name: "AWS", price: 1.01 }, { name: "RunPod", price: 0.37 }] },
];

export const BENCHMARK_DATA: BenchmarkEntry[] = [
  { rank: 1, name: "Claude Opus 4.6", arena: 1503, mmlu: 82.0, gpqa: 91.3, humaneval: 95.0, swe: 80.8, math: 97.6, type: "closed", price: "$15" },
  { rank: 2, name: "GPT-5", arena: 1480, mmlu: 80.0, gpqa: 88.4, humaneval: 96.0, swe: 76.3, math: 99.4, type: "closed", price: "$5.63" },
  { rank: 3, name: "Claude Sonnet 4.6", arena: 1470, mmlu: 78.0, gpqa: 74.1, humaneval: 93.0, swe: 79.6, math: 97.8, type: "closed", price: "$9" },
  { rank: 4, name: "Gemini 2.5 Pro", arena: 1450, mmlu: 78.0, gpqa: 84.0, humaneval: 93.0, swe: 63.8, math: 95.0, type: "closed", price: "$5.63" },
  { rank: 5, name: "Grok 3", arena: 1440, mmlu: 76.0, gpqa: 84.6, humaneval: 90.0, swe: 50.0, math: 92.0, type: "closed", price: "$9" },
  { rank: 6, name: "DeepSeek R1", arena: 1436, mmlu: 84.0, gpqa: 71.5, humaneval: 96.1, swe: 69.1, math: 97.3, type: "open", price: "$1.37" },
  { rank: 7, name: "o3 Pro", arena: 1430, mmlu: 81.5, gpqa: 87.7, humaneval: 94.0, swe: 71.2, math: 99.2, type: "closed", price: "$50" },
  { rank: 8, name: "Llama 4 Maverick", arena: 1417, mmlu: 80.5, gpqa: 69.8, humaneval: 88.0, swe: 45.0, math: 90.0, type: "open", price: "Host" },
  { rank: 9, name: "Qwen3 235B", arena: 1410, mmlu: 79.0, gpqa: 68.5, humaneval: 89.0, swe: 42.0, math: 91.5, type: "open", price: "$1.50" },
  { rank: 10, name: "GPT-4o", arena: 1350, mmlu: 65.0, gpqa: 53.6, humaneval: 90.2, swe: 45.2, math: 76.6, type: "closed", price: "$6.25" },
  { rank: 11, name: "Claude Haiku 4.5", arena: 1350, mmlu: 70.5, gpqa: 52.0, humaneval: 85.0, swe: 73.3, math: 85.0, type: "closed", price: "$3" },
  { rank: 12, name: "Grok 3 Mini", arena: 1340, mmlu: 68.5, gpqa: 58.0, humaneval: 86.0, swe: 40.0, math: 88.0, type: "closed", price: "$0.40" },
  { rank: 13, name: "Llama 4 Scout", arena: 1320, mmlu: 67.0, gpqa: 55.0, humaneval: 82.0, swe: 38.0, math: 84.0, type: "open", price: "Host" },
  { rank: 14, name: "Mistral Large", arena: 1300, mmlu: 68.0, gpqa: 50.0, humaneval: 92.0, swe: 36.0, math: 93.6, type: "open", price: "$4" },
  { rank: 15, name: "Gemma 3 27B", arena: 1280, mmlu: 62.0, gpqa: 45.0, humaneval: 80.0, swe: 28.0, math: 78.0, type: "open", price: "Host" },
];

export function findModel(query: string): LLMModel | undefined {
  const q = query.toLowerCase().replace(/[-\s.]/g, "");
  return LLM_DATA.find((m) => m.name.toLowerCase().replace(/[-\s.]/g, "").includes(q));
}

export function findGpu(query: string): GPUEntry | undefined {
  const q = query.toLowerCase().replace(/[-\s]/g, "");
  return GPU_DATA.find((g) => g.name.toLowerCase().replace(/[-\s]/g, "").includes(q));
}
