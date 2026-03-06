import type { Handler, HandlerEvent } from "@netlify/functions";
import { authenticateApiKey } from "./lib/api-auth.js";
import { BENCHMARK_DATA } from "./lib/data.js";

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

  // Optional filter
  const typeFilter = event.queryStringParameters?.type?.toLowerCase();

  let data = BENCHMARK_DATA;
  if (typeFilter && (typeFilter === "open" || typeFilter === "closed")) {
    data = data.filter((b) => b.type === typeFilter);
  }

  return json({
    data,
    count: data.length,
    meta: { source: "perffeco", updated: new Date().toISOString().slice(0, 10) },
  });
};
