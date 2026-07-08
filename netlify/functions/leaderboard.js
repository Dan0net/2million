// GET /api/leaderboard → URLs ranked by how many pixels they own.
// Aggregates the order records; skips orders with no link.

import { listOrders } from "./_lib/blobs.js";

export const config = { path: "/api/leaderboard" };

export default async () => {
  const byUrl = new Map(); // url → { url, description, pixels }
  for (const o of await listOrders()) {
    if (!o.url || !Array.isArray(o.pixels) || !o.pixels.length) continue;
    const cur = byUrl.get(o.url) || { url: o.url, description: o.description || "", pixels: 0 };
    cur.pixels += o.pixels.length;
    byUrl.set(o.url, cur);
  }
  const rows = [...byUrl.values()].sort((a, b) => b.pixels - a.pixels).slice(0, 100);

  return new Response(JSON.stringify(rows), {
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
};
