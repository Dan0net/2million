// POST /api/webhook — Stripe events. This is the ONLY source of truth for
// fulfilment; we never place pixels on the success redirect.
//   checkout.session.completed → place the free pixels, refund any that were
//   already taken, record the order (with buyer email), rebuild the board.

import { stripe } from "./_lib/stripe.js";
import { store, orderKey, sessionKey, listOrders } from "./_lib/blobs.js";
import { rebuildBoard } from "./_lib/board-png.js";
import { refundAmountForConflicts, key as pixelKey } from "./_lib/pixels.js";

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
      // Return 500 so Stripe retries (refunds use an idempotency key, so a
      // retry won't double-refund).
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

  // Split into pixels we can place vs. ones already owned by an earlier order.
  // Check against the ORDER RECORDS (the synchronously-written source of truth),
  // not the board PNG which lags a rebuild behind — this tightens the race
  // window for concurrent overlapping purchases. Residual risk: two webhooks
  // committing overlapping pixels within the same instant can still both write
  // before either is visible (Netlify Blobs has no atomic compare-and-swap);
  // closing that fully needs an external atomic store.
  const owned = new Set();
  for (const o of await listOrders(s)) {
    if (o.id !== orderId && Array.isArray(o.pixels)) {
      for (const p of o.pixels) owned.add(pixelKey(p.x, p.y));
    }
  }
  const place = [];
  const conflicts = [];
  for (const p of stash.pixels) (owned.has(pixelKey(p.x, p.y)) ? conflicts : place).push(p);

  // Refund the conflicting pixels proportionally to what was actually paid.
  // Do this BEFORE recording the order so a failure retries; the idempotency
  // key stops a retry from refunding twice.
  const refund = refundAmountForConflicts(session.amount_total || 0, conflicts.length, stash.pixels.length);
  if (refund > 0 && session.payment_intent) {
    await stripe().refunds.create(
      { payment_intent: session.payment_intent, amount: refund },
      { idempotencyKey: `refund_${orderId}` }
    );
  }

  // Always record an order (even if empty) so retries stay idempotent.
  await s.setJSON(orderKey(orderId), {
    id: orderId,
    pixels: place,
    description: stash.description,
    url: stash.url,
    email: session.customer_details?.email ?? null,
    createdAt: Date.now(),
    stripeSessionId: session.id,
    ...(refund > 0 ? { refundedCents: refund } : {}),
  });

  await rebuildBoard(s);
  await s.delete(sessionKey(orderId)).catch(() => {});
}
