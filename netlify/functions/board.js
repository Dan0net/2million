// GET /api/board → the current board as a PNG.
// Creates a blank (fully transparent) board on first request.

import { store, BOARD_KEY } from "./_lib/blobs.js";
import { blankPNG, encode } from "./_lib/board-png.js";

export const config = { path: "/api/board" };

export default async () => {
  const s = store();
  let buf = await s.get(BOARD_KEY, { type: "arrayBuffer" });

  let body;
  if (!buf) {
    body = encode(blankPNG()); // Buffer
    await s.set(BOARD_KEY, body);
  } else {
    body = Buffer.from(buf);
  }

  return new Response(body, {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "no-store",
    },
  });
};
