// GET /api/config → what the browser needs to bootstrap.

import { TEST_MODE } from "./_lib/stripe.js";
import { WIDTH, HEIGHT, RADIUS } from "./_lib/pixels.js";

export const config = { path: "/api/config" };

export default async () =>
  Response.json({
    testMode: TEST_MODE,
    width: WIDTH,
    height: HEIGHT,
    radius: RADIUS,
    rentPerMonth: 1,
    lifetimePrice: 1000,
  });
