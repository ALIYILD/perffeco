import type { Handler, HandlerEvent } from "@netlify/functions";
import { authenticateApiKey } from "./lib/api-auth.js";
import { LLM_DATA } from "./lib/data.js";

function json(body: unknown, status = 200, cacheSeconds = 300) {
  return {
    statusCode: status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": `public, max-age=${cacheSeconds}`,
    },
    body: JSON.stringify(body),
  };
}

export const handler: Handler = async (event: HandlerEvent) => {
  if (event.httpMethod !== "GET") return json({ error: "Method not allowed" }, 405, 0);

  const auth = await authenticateApiKey(event);
  if (!auth.valid) return json({ error: auth.error }, auth.status ?? 401, 0);

  // Optional filters
  const provider = event.queryStringParameters?.provider?.toLowerCase();
  const tier = event.queryStringParameters?.tier?.toLowerCase();

  let data = LLM_DATA;
  if (provider) data = data.filter((m) => m.provider === provider);
  if (tier) data = data.filter((m) => m.tier.toLowerCase() === tier);

  return json({
    data,
    count: data.length,
    meta: { source: "perffeco", updated: new Date().toISOString().slice(0, 10) },
  });
};
