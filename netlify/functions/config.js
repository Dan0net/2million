// GET /api/config → what the browser needs to bootstrap.

import { TEST_MODE } from "./_lib/stripe.js";
import { WIDTH, HEIGHT } from "./_lib/pixels.js";
import { store, REV_KEY } from "./_lib/blobs.js";

export const config = { path: "/api/config" };

export default async () => {
  const rev = (await store().get(REV_KEY, { type: "text" })) || "0";
  return Response.json(
    { testMode: TEST_MODE, width: WIDTH, height: HEIGHT, price: 1, rev },
    { headers: { "Cache-Control": "no-store" } }
  );
};
