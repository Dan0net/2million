// GET /api/config → what the browser needs to bootstrap.

import { TEST_MODE } from "./_lib/stripe.js";
import { WIDTH, HEIGHT } from "./_lib/pixels.js";
import { store, REV_KEY } from "./_lib/blobs.js";
import { getCount } from "./_lib/board-png.js";

export const config = { path: "/api/config" };

export default async () => {
  const s = store();
  const rev = (await s.get(REV_KEY, { type: "text" })) || "0";
  const count = await getCount(s);
  return Response.json(
    { testMode: TEST_MODE, width: WIDTH, height: HEIGHT, price: 1, rev, count },
    { headers: { "Cache-Control": "no-store" } }
  );
};
