// Geometry + validation for the circular pixel board.
// Shared by every function so the rules live in exactly one place.

export const WIDTH = 1600;
export const HEIGHT = 1600;
export const CX = WIDTH / 2; // 800
export const CY = HEIGHT / 2; // 800
export const RADIUS = WIDTH / 2; // 800  → circle fills the 1600×1600 box
export const MAX_PIXELS_PER_ORDER = 5000; // guard against giant payloads

const HEX = /^#[0-9a-fA-F]{6}$/;

// Canonical index for a pixel — also its identity for de-duplication.
export function key(x, y) {
  return y * WIDTH + x;
}

// A pixel is only valid if its centre lies within the circle.
export function inCircle(x, y) {
  const dx = x + 0.5 - CX;
  const dy = y + 0.5 - CY;
  return dx * dx + dy * dy <= RADIUS * RADIUS;
}

export function isValidColor(c) {
  return typeof c === "string" && HEX.test(c);
}

// Normalise a hex string to lowercase and return [r, g, b].
export function hexToRgb(hex) {
  const h = hex.toLowerCase();
  return [
    parseInt(h.slice(1, 3), 16),
    parseInt(h.slice(3, 5), 16),
    parseInt(h.slice(5, 7), 16),
  ];
}

// Validate + de-duplicate an incoming selection.
// Returns { ok: true, pixels } or { ok: false, error }.
export function validateSelection(input) {
  if (!Array.isArray(input) || input.length === 0) {
    return { ok: false, error: "No pixels supplied." };
  }
  if (input.length > MAX_PIXELS_PER_ORDER) {
    return { ok: false, error: `Too many pixels (max ${MAX_PIXELS_PER_ORDER}).` };
  }

  const seen = new Set();
  const pixels = [];
  for (const p of input) {
    if (!p || typeof p !== "object") return { ok: false, error: "Malformed pixel." };
    const x = Number(p.x);
    const y = Number(p.y);
    if (!Number.isInteger(x) || !Number.isInteger(y)) {
      return { ok: false, error: "Pixel coordinates must be integers." };
    }
    if (x < 0 || x >= WIDTH || y < 0 || y >= HEIGHT || !inCircle(x, y)) {
      return { ok: false, error: `Pixel (${x}, ${y}) is outside the circle.` };
    }
    if (!isValidColor(p.color)) {
      return { ok: false, error: `Pixel (${x}, ${y}) has an invalid colour.` };
    }
    const k = key(x, y);
    if (seen.has(k)) continue; // drop duplicates within one selection
    seen.add(k);
    pixels.push({ x, y, color: p.color.toLowerCase() });
  }
  return { ok: true, pixels };
}
