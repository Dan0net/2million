// POST /api/checkout — real payments (used when TEST_MODE=false).
// Validates the selection, rejects taken pixels, stashes the pixel list, and
// creates a Stripe Checkout Session:
//   rent → subscription of $1/month per pixel (quantity = pixel count)
//   buy  → one-time payment of $1000 per pixel
// Pixels are only committed to the board by the webhook after payment.

import { TEST_MODE, stripe, siteUrl, PRICE_LIFETIME_CENTS } from "./_lib/stripe.js";
import { store, orderKey, sessionKey } from "./_lib/blobs.js";
import { validateSelection, WIDTH } from "./_lib/pixels.js";
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
  const mode = body?.mode === "buy" ? "buy" : "rent";

  const s = store();
  const png = await loadBoard(s);
  const conflicts = v.pixels.filter((p) => isTaken(png, p.x, p.y));
  if (conflicts.length) {
    return json(
      { error: "Some pixels were already taken.", conflicts: conflicts.map(({ x, y }) => ({ x, y })), width: WIDTH },
      409
    );
  }

  if (mode === "rent" && !process.env.STRIPE_RENT_PRICE_ID) {
    return json({ error: "Rent is not configured (missing STRIPE_RENT_PRICE_ID)." }, 500);
  }

  const orderId = crypto.randomUUID();
  // Stash the pixels server-side so we don't hit Stripe metadata size limits.
  await s.setJSON(sessionKey(orderId), { mode, pixels: v.pixels });

  const count = v.pixels.length;
  const common = {
    metadata: { orderId, mode },
    success_url: `${siteUrl()}/?status=success`,
    cancel_url: `${siteUrl()}/?status=cancel`,
  };

  let session;
  try {
    if (mode === "rent") {
      session = await stripe().checkout.sessions.create({
        ...common,
        mode: "subscription",
        line_items: [{ price: process.env.STRIPE_RENT_PRICE_ID, quantity: count }],
        subscription_data: { metadata: { orderId } },
      });
    } else {
      session = await stripe().checkout.sessions.create({
        ...common,
        mode: "payment",
        line_items: [
          {
            quantity: count,
            price_data: {
              currency: "usd",
              unit_amount: PRICE_LIFETIME_CENTS,
              product_data: { name: "Rent-a-Pixel — lifetime pixel" },
            },
          },
        ],
      });
    }
  } catch (err) {
    await s.delete(sessionKey(orderId)).catch(() => {});
    return json({ error: "Stripe error: " + (err.message || "unknown") }, 502);
  }

  // Record the session id on the stash for cross-referencing.
  await s.setJSON(sessionKey(orderId), { mode, pixels: v.pixels, stripeSessionId: session.id });

  return json({ url: session.url, orderKey: orderKey(orderId) });
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}
