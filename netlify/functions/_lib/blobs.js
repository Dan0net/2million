// Thin wrapper around Netlify Blobs — our only persistent storage.
//
// Keys we use inside the "rentapixel" store:
//   board.png                    → the canonical board image (bytes)
//   orders/<orderId>.json        → source of truth for one claim/purchase
//   sessions/<orderId>.json      → pending pixel list stashed during Stripe checkout
//   subs/<subscriptionId>.json   → maps a Stripe subscription back to its orderId

import { getStore } from "@netlify/blobs";

// Strong consistency so a claim is immediately visible to the next read.
export function store() {
  return getStore({ name: "rentapixel", consistency: "strong" });
}

export const BOARD_KEY = "board.png";
export const orderKey = (id) => `orders/${id}.json`;
export const sessionKey = (id) => `sessions/${id}.json`;
export const subKey = (id) => `subs/${id}.json`;

// List all order records (used by the scheduled rebuild).
export async function listOrders(s = store()) {
  const orders = [];
  const { blobs } = await s.list({ prefix: "orders/" });
  for (const b of blobs) {
    const o = await s.get(b.key, { type: "json" });
    if (o) orders.push({ ...o, _key: b.key });
  }
  return orders;
}
