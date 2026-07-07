// Thin wrapper around Netlify Blobs — our only persistent storage.
//
// Keys we use inside the "rentapixel" store:
//   board.png                → the canonical board image (bytes)
//   orders/<orderId>.json    → source of truth for one purchase
//                              { id, pixels:[{x,y,color}], description, url, createdAt }
//   sessions/<orderId>.json  → pending purchase stashed during Stripe checkout

import { getStore } from "@netlify/blobs";

// Strong consistency so a purchase is immediately visible to the next read.
export function store() {
  return getStore({ name: "rentapixel", consistency: "strong" });
}

export const BOARD_KEY = "board.png";
export const REV_KEY = "board.rev"; // bumped on every board change; used as a cache key
export const VERSION_KEY = "board.version";
// Bump to force a one-time full reset (wipes all orders + blanks the board).
export const BOARD_VERSION = "3";
export const orderKey = (id) => `orders/${id}.json`;
export const sessionKey = (id) => `sessions/${id}.json`;

// List all order records (used by the pixel lookup).
export async function listOrders(s = store()) {
  const orders = [];
  const { blobs } = await s.list({ prefix: "orders/" });
  for (const b of blobs) {
    const o = await s.get(b.key, { type: "json" });
    if (o) orders.push(o);
  }
  return orders;
}
