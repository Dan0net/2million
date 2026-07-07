// Scheduled hourly. Rebuilds board.png from scratch out of all non-expired
// orders (authoritative — self-heals any drift from concurrent writes) and
// prunes rentals whose rent has lapsed.

import { store, orderKey, subKey, listOrders } from "./_lib/blobs.js";
import { blankPNG, paint, saveBoard } from "./_lib/board-png.js";

export const config = { schedule: "@hourly" };

export default async () => {
  const s = store();
  const orders = await listOrders(s);
  const now = Date.now();

  const png = blankPNG();
  let kept = 0;
  let expired = 0;

  for (const order of orders) {
    const isExpired = order.type === "rent" && order.expiresAt && order.expiresAt < now;
    if (isExpired) {
      expired++;
      await s.delete(orderKey(order.id)).catch(() => {});
      if (order.subscriptionId) await s.delete(subKey(order.subscriptionId)).catch(() => {});
      continue;
    }
    if (Array.isArray(order.pixels)) {
      paint(png, order.pixels);
      kept++;
    }
  }

  await saveBoard(png, s);

  return new Response(
    JSON.stringify({ rebuilt: true, keptOrders: kept, expiredOrders: expired }),
    { headers: { "Content-Type": "application/json" } }
  );
};
