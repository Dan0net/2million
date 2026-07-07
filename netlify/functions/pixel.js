// GET /api/pixel?x=&y= → the description + link for an owned pixel.
// Scans orders for the one containing (x,y). 404 if the pixel is unowned.

import { listOrders } from "./_lib/blobs.js";
import { WIDTH, HEIGHT } from "./_lib/pixels.js";

export const config = { path: "/api/pixel" };

export default async (req) => {
  const u = new URL(req.url);
  const x = Number(u.searchParams.get("x"));
  const y = Number(u.searchParams.get("y"));
  if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || x >= WIDTH || y < 0 || y >= HEIGHT) {
    return json({ error: "Bad coordinates." }, 400);
  }

  for (const order of await listOrders()) {
    const px = order.pixels?.find((p) => p.x === x && p.y === y);
    if (px) {
      return json({ description: order.description, url: order.url, color: px.color });
    }
  }
  return json({ error: "Not found." }, 404);
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}
