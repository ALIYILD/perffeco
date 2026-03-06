import type { Handler, HandlerEvent } from "@netlify/functions";
import { authenticateApiKey } from "./lib/api-auth.js";
import { GPU_DATA } from "./lib/data.js";

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
  const providerFilter = event.queryStringParameters?.provider?.toLowerCase();
  const gpuFilter = event.queryStringParameters?.gpu?.toLowerCase().replace(/[-\s]/g, "");

  let data = GPU_DATA;
  if (gpuFilter) data = data.filter((g) => g.name.toLowerCase().replace(/[-\s]/g, "").includes(gpuFilter));
  if (providerFilter) {
    data = data.map((g) => ({
      ...g,
      providers: g.providers.filter((p) => p.name.toLowerCase() === providerFilter),
    })).filter((g) => g.providers.length > 0);
  }

  return json({
    data,
    count: data.length,
    meta: { source: "perffeco", updated: new Date().toISOString().slice(0, 10) },
  });
};
