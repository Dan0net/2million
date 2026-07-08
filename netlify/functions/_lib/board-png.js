// Read, paint, and write the board PNG stored in Netlify Blobs.
//
// The PNG *is* the board: every owned pixel carries its RGB colour with
// alpha 255; every free pixel has alpha 0. The browser reads the alpha
// channel to know which pixels are still buyable — so we never ship a
// giant JSON list to the client.

import { PNG } from "pngjs";
import { store, BOARD_KEY, REV_KEY, COUNT_KEY, VERSION_KEY, BOARD_VERSION, listOrders } from "./blobs.js";
import { WIDTH, HEIGHT, hexToRgb } from "./pixels.js";

// A fresh, fully-transparent board.
export function blankPNG() {
  // pngjs zero-fills .data, so every pixel starts at rgba(0,0,0,0).
  return new PNG({ width: WIDTH, height: HEIGHT });
}

export function encode(png) {
  return PNG.sync.write(png);
}

export function decode(buffer) {
  return PNG.sync.read(buffer);
}

// One-time reset: when BOARD_VERSION changes, wipe everything — delete all
// order + pending-session records and blank the board — then stamp the new
// version. Runs once (then it's a cheap no-op). Bump BOARD_VERSION to reset.
export async function ensureVersion(s = store()) {
  const ver = await s.get(VERSION_KEY, { type: "text" });
  if (ver === BOARD_VERSION) return;

  for (const prefix of ["orders/", "sessions/"]) {
    const { blobs } = await s.list({ prefix });
    for (const b of blobs) await s.delete(b.key).catch(() => {});
  }
  await s.set(BOARD_KEY, encode(blankPNG()));
  await s.set(REV_KEY, String(Date.now()));
  await s.set(COUNT_KEY, "0");
  await s.set(VERSION_KEY, BOARD_VERSION);
}

// Load the current board, creating a blank one on first use.
export async function loadBoard(s = store()) {
  await ensureVersion(s);
  const buf = await s.get(BOARD_KEY, { type: "arrayBuffer" });
  if (!buf) return blankPNG();
  return decode(Buffer.from(buf));
}

export async function saveBoard(png, s = store()) {
  await s.set(BOARD_KEY, encode(png));
  await s.set(REV_KEY, String(Date.now())); // new revision → busts the board cache
}

// Rebuild board.png from scratch out of the order records (the source of
// truth), so the image can never drift from what people actually bought.
export async function rebuildBoard(s = store()) {
  const png = blankPNG();
  for (const o of await listOrders(s)) {
    if (Array.isArray(o.pixels)) paint(png, o.pixels);
  }
  await saveBoard(png, s);
  // Count unique sold (opaque) pixels straight off the rebuilt board.
  let count = 0;
  for (let i = 3; i < png.data.length; i += 4) if (png.data[i] > 0) count++;
  await s.set(COUNT_KEY, String(count));
  return png;
}

function idx(x, y) {
  return (WIDTH * y + x) << 2;
}

export function isTaken(png, x, y) {
  return png.data[idx(x, y) + 3] > 0;
}

// Paint an array of { x, y, color } onto the board (alpha → 255).
export function paint(png, pixels) {
  for (const { x, y, color } of pixels) {
    const [r, g, b] = hexToRgb(color);
    const i = idx(x, y);
    png.data[i] = r;
    png.data[i + 1] = g;
    png.data[i + 2] = b;
    png.data[i + 3] = 255;
  }
}

