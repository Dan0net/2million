// POST /api/claim — TEST MODE ONLY.
// Lets anyone buy pixels for free (no Stripe). Validates the selection + the
// description/URL, rejects already-taken pixels, then writes an order and
// paints the board.

import { TEST_MODE } from "./_lib/stripe.js";
import { store, orderKey } from "./_lib/blobs.js";
import { validateSelection, validateMeta, WIDTH } from "./_lib/pixels.js";
import { loadBoard, isTaken, paint, saveBoard } from "./_lib/board-png.js";

export const config = { path: "/api/claim" };

export default async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (!TEST_MODE) return json({ error: "Test mode is off; use checkout." }, 403);

  let body;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON." }, 400);
  }

  const v = validateSelection(body?.pixels);
  if (!v.ok) return json({ error: v.error }, 400);
  const m = validateMeta(body);
  if (!m.ok) return json({ error: m.error }, 400);

  const s = store();
  const png = await loadBoard(s);

  const conflicts = v.pixels.filter((p) => isTaken(png, p.x, p.y));
  if (conflicts.length) {
    return json(
      { error: "Some pixels were already taken.", conflicts: conflicts.map(({ x, y }) => ({ x, y })), width: WIDTH },
      409
    );
  }

  paint(png, v.pixels);
  await saveBoard(png, s);

  const id = crypto.randomUUID();
  await s.setJSON(orderKey(id), {
    id,
    pixels: v.pixels,
    description: m.description,
    url: m.url,
    createdAt: Date.now(),
    test: true,
  });

  return json({ ok: true, orderId: id, pixels: v.pixels });
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}
