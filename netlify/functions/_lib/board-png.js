// Read, paint, and write the board PNG stored in Netlify Blobs.
//
// The PNG *is* the board: every owned pixel carries its RGB colour with
// alpha 255; every free pixel has alpha 0. The browser reads the alpha
// channel to know which pixels are still buyable — so we never ship a
// giant JSON list to the client.

import { PNG } from "pngjs";
import { store, BOARD_KEY, VERSION_KEY, BOARD_VERSION } from "./blobs.js";
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

// One-time reset: if the stored board predates the current BOARD_VERSION,
// overwrite it with a fresh blank board. Runs once (then it's a cheap no-op),
// so we never keep any per-request dimension-guessing logic around.
export async function ensureVersion(s = store()) {
  const ver = await s.get(VERSION_KEY, { type: "text" });
  if (ver !== BOARD_VERSION) {
    await s.set(BOARD_KEY, encode(blankPNG()));
    await s.set(VERSION_KEY, BOARD_VERSION);
  }
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

