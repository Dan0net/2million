// POST /api/webhook — Stripe events. This is the ONLY source of truth for
// fulfilment; we never place pixels on the success redirect.
//
//   checkout.session.completed   → write order + paint board
//   invoice.paid                 → extend a rental's expiry
//   customer.subscription.deleted→ delete order + clear its pixels

import { stripe } from "./_lib/stripe.js";
import { store, orderKey, sessionKey, subKey } from "./_lib/blobs.js";
import { loadBoard, paint, clear, saveBoard } from "./_lib/board-png.js";

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

  const s = store();

  try {
    if (event.type === "checkout.session.completed") {
      await handleCompleted(s, event.data.object);
    } else if (event.type === "invoice.paid") {
      await handleInvoicePaid(s, event.data.object);
    } else if (event.type === "customer.subscription.deleted") {
      await handleSubDeleted(s, event.data.object);
    }
  } catch (err) {
    // Return 500 so Stripe retries.
    return new Response(`Handler error: ${err.message}`, { status: 500 });
  }

  return new Response("ok", { status: 200 });
};

async function handleCompleted(s, session) {
  const orderId = session.metadata?.orderId;
  if (!orderId) return;

  // Idempotency: if the order already exists, we've processed this.
  const existing = await s.get(orderKey(orderId), { type: "json" });
  if (existing) return;

  const stash = await s.get(sessionKey(orderId), { type: "json" });
  if (!stash) return; // nothing to place

  const { mode, pixels } = stash;

  const order = {
    id: orderId,
    type: mode === "buy" ? "lifetime" : "rent",
    pixels,
    createdAt: Date.now(),
    stripeSessionId: session.id,
  };

  if (mode === "rent" && session.subscription) {
    order.subscriptionId = session.subscription;
    try {
      const sub = await stripe().subscriptions.retrieve(session.subscription);
      if (sub.current_period_end) order.expiresAt = sub.current_period_end * 1000;
    } catch {
      /* expiry will be set on the next invoice.paid */
    }
    await s.setJSON(subKey(session.subscription), { orderId });
  }

  const png = await loadBoard(s);
  paint(png, pixels);
  await saveBoard(png, s);

  await s.setJSON(orderKey(orderId), order);
  await s.delete(sessionKey(orderId)).catch(() => {});
}

async function handleInvoicePaid(s, invoice) {
  const subId = invoice.subscription;
  if (!subId) return;
  const map = await s.get(subKey(subId), { type: "json" });
  if (!map?.orderId) return; // subscription not linked yet
  const order = await s.get(orderKey(map.orderId), { type: "json" });
  if (!order) return;

  const line = invoice.lines?.data?.[0];
  const periodEnd = line?.period?.end;
  order.expiresAt = periodEnd ? periodEnd * 1000 : Date.now() + 31 * 24 * 60 * 60 * 1000;
  await s.setJSON(orderKey(map.orderId), order);
}

async function handleSubDeleted(s, sub) {
  const map = await s.get(subKey(sub.id), { type: "json" });
  if (!map?.orderId) return;
  const order = await s.get(orderKey(map.orderId), { type: "json" });
  if (order?.pixels) {
    const png = await loadBoard(s);
    clear(png, order.pixels);
    await saveBoard(png, s);
  }
  await s.delete(orderKey(map.orderId)).catch(() => {});
  await s.delete(subKey(sub.id)).catch(() => {});
}
