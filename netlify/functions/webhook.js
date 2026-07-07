// POST /api/webhook — Stripe events. This is the ONLY source of truth for
// fulfilment; we never place pixels on the success redirect.
//   checkout.session.completed → write the order + paint the board (idempotent)

import { stripe } from "./_lib/stripe.js";
import { store, orderKey, sessionKey } from "./_lib/blobs.js";
import { loadBoard, paint, saveBoard } from "./_lib/board-png.js";

export const config = { path: "/api/webhook" };

export default async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return new Response("Webhook not configured", { status: 500 });

  const sig = req.headers.get("stripe-signature");
  const raw = await req.text();

  let event;
  try {
    event = await stripe().webhooks.constructEventAsync(raw, sig, secret);
  } catch (err) {
    return new Response(`Signature verification failed: ${err.message}`, { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    try {
      await fulfil(store(), event.data.object);
    } catch (err) {
      return new Response(`Handler error: ${err.message}`, { status: 500 });
    }
  }

  return new Response("ok", { status: 200 });
};

async function fulfil(s, session) {
  const orderId = session.metadata?.orderId;
  if (!orderId) return;

  // Idempotency: if the order already exists, we've processed this event.
  if (await s.get(orderKey(orderId), { type: "json" })) return;

  const stash = await s.get(sessionKey(orderId), { type: "json" });
  if (!stash) return;

  const png = await loadBoard(s);
  paint(png, stash.pixels);
  await saveBoard(png, s);

  await s.setJSON(orderKey(orderId), {
    id: orderId,
    pixels: stash.pixels,
    description: stash.description,
    url: stash.url,
    createdAt: Date.now(),
    stripeSessionId: session.id,
  });
  await s.delete(sessionKey(orderId)).catch(() => {});
}
