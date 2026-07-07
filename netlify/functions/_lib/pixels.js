// Geometry + validation for the rectangular pixel board.
// Shared by every function so the rules live in exactly one place.

export const WIDTH = 1250;
export const HEIGHT = 1600; // 1250 × 1600 = 2,000,000 pixels ($1 each)
export const MAX_PIXELS_PER_ORDER = 5000; // guard against giant payloads
export const MAX_DESC = 140;

const HEX = /^#[0-9a-fA-F]{6}$/;

// Canonical index for a pixel — also its identity for de-duplication.
export function key(x, y) {
  return y * WIDTH + x;
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
    if (x < 0 || x >= WIDTH || y < 0 || y >= HEIGHT) {
      return { ok: false, error: `Pixel (${x}, ${y}) is off the board.` };
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

// Normalise a user-supplied link. The URL is OPTIONAL and the scheme may be
// omitted (a bare domain like "example.com" becomes "https://example.com").
// Returns { ok: true, url } (url may be "") or { ok: false }.
export function normalizeUrl(raw) {
  const s = typeof raw === "string" ? raw.trim() : "";
  if (!s) return { ok: true, url: "" };
  const candidate = /^https?:\/\//i.test(s) ? s : "https://" + s;
  let u;
  try {
    u = new URL(candidate);
  } catch {
    return { ok: false };
  }
  if ((u.protocol !== "http:" && u.protocol !== "https:") || !u.hostname.includes(".")) {
    return { ok: false };
  }
  return { ok: true, url: u.href };
}

// Proportional refund (in cents) for the pixels that turned out to be already
// owned at fulfilment — based on what was actually paid, so discounts/promos
// are respected. Returns 0 for free ($0) orders.
export function refundAmountForConflicts(amountTotalCents, conflictCount, totalCount) {
  if (!amountTotalCents || !conflictCount || !totalCount) return 0;
  return Math.round((amountTotalCents * conflictCount) / totalCount);
}

// Validate the description (required) + link (optional) attached to a purchase.
// Returns { ok: true, description, url } or { ok: false, error }.
export function validateMeta({ description, url } = {}) {
  const desc = typeof description === "string" ? description.trim().replace(/\s+/g, " ") : "";
  if (!desc) return { ok: false, error: "A description is required." };
  if (desc.length > MAX_DESC) return { ok: false, error: `Description too long (max ${MAX_DESC}).` };

  const link = normalizeUrl(url);
  if (!link.ok) return { ok: false, error: "That link doesn't look like a valid domain or URL." };

  return { ok: true, description: desc.slice(0, MAX_DESC), url: link.url };
}
