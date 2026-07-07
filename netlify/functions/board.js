// GET /api/board → the current board as a PNG.
// Creates a blank board on first request and performs the one-time
// BOARD_VERSION reset if needed.

import { store, BOARD_KEY } from "./_lib/blobs.js";
import { blankPNG, encode, ensureVersion } from "./_lib/board-png.js";

export const config = { path: "/api/board" };

export default async () => {
  const s = store();
  await ensureVersion(s); // one-time reset when BOARD_VERSION changes

  let buf = await s.get(BOARD_KEY, { type: "arrayBuffer" });
  let body;
  if (!buf) {
    body = encode(blankPNG());
    await s.set(BOARD_KEY, body);
  } else {
    body = Buffer.from(buf);
  }

  // The URL carries a ?v=<rev> cache key (see config.rev), so each revision is a
  // distinct, immutable asset — cache it hard on the browser AND Netlify's edge.
  const cache = "public, max-age=31536000, immutable";
  return new Response(body, {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": cache,
      "Netlify-CDN-Cache-Control": cache,
    },
  });
};
