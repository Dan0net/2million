// POST /api/checkout — real payments (used when TEST_MODE=false).
// Validates the selection + description/URL, rejects taken pixels, stashes the
// pending purchase, and creates a one-time Stripe Checkout Session for
// $1 × pixel count. Pixels are only committed by the webhook after payment.

import { TEST_MODE, stripe, siteUrl, PRICE_CENTS } from "./_lib/stripe.js";
import { store, sessionKey } from "./_lib/blobs.js";
import { validateSelection, validateMeta, WIDTH } from "./_lib/pixels.js";
import { loadBoard, isTaken } from "./_lib/board-png.js";

export const config = { path: "/api/checkout" };

export default async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (TEST_MODE) return json({ error: "Test mode is on; pixels are free via /api/claim." }, 403);

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

  const orderId = crypto.randomUUID();
  await s.setJSON(sessionKey(orderId), { pixels: v.pixels, description: m.description, url: m.url });

  const count = v.pixels.length;
  let session;
  try {
    session = await stripe().checkout.sessions.create({
      mode: "payment",
      line_items: [
        {
          quantity: count,
          price_data: {
            currency: "usd",
            unit_amount: PRICE_CENTS,
            product_data: { name: "Pixels — 2 Million Dollar Homepage" },
          },
        },
      ],
      metadata: { orderId },
      success_url: `${siteUrl()}/?status=success`,
      cancel_url: `${siteUrl()}/?status=cancel`,
    });
  } catch (err) {
    await s.delete(sessionKey(orderId)).catch(() => {});
    return json({ error: "Stripe error: " + (err.message || "unknown") }, 502);
  }

  return json({ url: session.url });
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}
