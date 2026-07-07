// Bootstraps the 2 Million Dollar Homepage. Pick a colour, tap pixels (each
// tap places the active colour and gently zooms in), then Buy — which asks for
// a description + link. Tapping an owned pixel shows its description + link.

import { createBoardView } from "./canvas.js";
import { createCart } from "./cart.js";

// ── Colour maths (HSV ↔ hex) ──
const hexToRgb = (hex) => {
  const h = hex.replace("#", "");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
};
const rgbToHsv = (r, g, b) => {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = 0;
  if (d) {
    if (max === r) h = 60 * (((g - b) / d) % 6);
    else if (max === g) h = 60 * ((b - r) / d + 2);
    else h = 60 * ((r - g) / d + 4);
  }
  if (h < 0) h += 360;
  return { h, s: max === 0 ? 0 : d / max, v: max };
};
const hexToHsv = (hex) => { const [r, g, b] = hexToRgb(hex); return rgbToHsv(r, g, b); };
const hsvToHex = (h, s, v) => {
  const c = v * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = v - c;
  let r, g, b;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return "#" + [r, g, b].map((n) => Math.round((n + m) * 255).toString(16).padStart(2, "0")).join("");
};

// r/place-style palette (raw); rendered order is computed below.
const RAW_PRESETS = [
  "#be0039", "#ff4500", "#ffa800", "#ffd635", "#fff8b8",
  "#00cc78", "#7eed56", "#00a368", "#00756f", "#009eaa", "#00ccc0",
  "#2450a4", "#3690ea", "#51e9f4", "#493ac1", "#6a5cff", "#94b3ff",
  "#811e9f", "#b44ac0", "#e4abff", "#de107f", "#ff3881", "#ff99aa",
  "#6d482f", "#9c6926", "#ffb470",
  "#6d001a", "#000000", "#515252", "#898d90", "#d4d7d9", "#ffffff",
];

// Sort chromatic swatches by hue, rotated to start at the vibrant red; append
// the neutrals (near-zero saturation) as a dark→light ramp at the end.
const DEFAULT_COLOR = "#be0039";
const PRESETS = (() => {
  const items = RAW_PRESETS.map((c) => ({ c, hsv: hexToHsv(c) }));
  const chroma = items.filter((x) => x.hsv.s >= 0.08)
    .sort((a, b) => a.hsv.h - b.hsv.h || b.hsv.v - a.hsv.v);
  const neutral = items.filter((x) => x.hsv.s < 0.08).sort((a, b) => a.hsv.v - b.hsv.v);
  const i = chroma.findIndex((x) => x.c === DEFAULT_COLOR);
  const rotated = i > 0 ? chroma.slice(i).concat(chroma.slice(0, i)) : chroma;
  return rotated.concat(neutral).map((x) => x.c);
})();

const els = {
  canvas: document.getElementById("board"),
  bar: document.getElementById("bar"),
  swatches: document.getElementById("swatches"),
  customSwatch: document.getElementById("customSwatch"),
  clearBtn: document.getElementById("clearBtn"),
  buyBtn: document.getElementById("buyBtn"),
  toast: document.getElementById("toast"),
  // colour picker modal
  pickerModal: document.getElementById("pickerModal"),
  svBox: document.getElementById("svBox"),
  svHandle: document.getElementById("svHandle"),
  hueSlider: document.getElementById("hueSlider"),
  hueHandle: document.getElementById("hueHandle"),
  pickerPreview: document.getElementById("pickerPreview"),
  hexInput: document.getElementById("hexInput"),
  pickerCancel: document.getElementById("pickerCancel"),
  pickerUse: document.getElementById("pickerUse"),
  tooltip: document.getElementById("tooltip"),
  ttSpinner: document.getElementById("ttSpinner"),
  ttContent: document.getElementById("ttContent"),
  ttDesc: document.getElementById("ttDesc"),
  ttLink: document.getElementById("ttLink"),
  modal: document.getElementById("buyModal"),
  descInput: document.getElementById("descInput"),
  urlInput: document.getElementById("urlInput"),
  modalErr: document.getElementById("modalErr"),
  modalCancel: document.getElementById("modalCancel"),
  modalContinue: document.getElementById("modalContinue"),
};

let toastTimer;
function toast(msg, kind = "") {
  els.toast.textContent = msg;
  els.toast.className = "toast show " + kind;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (els.toast.className = "toast " + kind), 3200);
}

// URL is optional; a bare domain ("example.com") becomes "https://example.com".
// Returns { ok: true, url } (url may be "") or { ok: false }.
function normalizeUrl(raw) {
  const s = (raw || "").trim();
  if (!s) return { ok: true, url: "" };
  const cand = /^https?:\/\//i.test(s) ? s : "https://" + s;
  try {
    const u = new URL(cand);
    if ((u.protocol === "http:" || u.protocol === "https:") && u.hostname.includes(".")) {
      return { ok: true, url: u.href };
    }
  } catch { /* fall through */ }
  return { ok: false };
}

const HEX6 = /^#[0-9a-f]{6}$/i;

// Active paint colour (defaults to the first swatch — the vibrant red).
let activeColor = PRESETS[0];
function setColor(c) {
  activeColor = c;
  const lc = c.toLowerCase();
  let matched = false;
  for (const b of els.swatches.children) {
    if (!b.dataset.color) continue; // skip the custom swatch
    const on = b.dataset.color === lc;
    b.classList.toggle("active", on);
    if (on) matched = true;
  }
  // Custom swatch is "active" whenever the colour isn't one of the presets.
  els.customSwatch.classList.toggle("active", !matched);
}
function buildSwatches() {
  for (const c of PRESETS) {
    const b = document.createElement("button");
    b.style.background = c;
    b.dataset.color = c.toLowerCase();
    b.title = c;
    b.addEventListener("click", () => setColor(c));
    els.swatches.appendChild(b);
  }
}

// Keep a modal centred in the visible area (above the mobile keyboard).
function fitModal(el) {
  const vv = window.visualViewport;
  if (!vv) return;
  el.style.top = vv.offsetTop + "px";
  el.style.height = vv.height + "px";
}

const clamp01 = (n) => Math.max(0, Math.min(1, n));

// Standard HSV colour-picker modal: saturation/value box + hue slider + hex.
function createPicker() {
  const pk = { h: 0, s: 1, v: 1 };
  const fit = () => fitModal(els.pickerModal);

  function paintSV() {
    const cv = els.svBox, ctx = cv.getContext("2d"), w = cv.width, h = cv.height;
    ctx.fillStyle = `hsl(${pk.h}, 100%, 50%)`;
    ctx.fillRect(0, 0, w, h);
    let g = ctx.createLinearGradient(0, 0, w, 0);
    g.addColorStop(0, "#fff"); g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, "rgba(0,0,0,0)"); g.addColorStop(1, "#000");
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  }
  function reflect() {
    els.svHandle.style.left = pk.s * 100 + "%";
    els.svHandle.style.top = (1 - pk.v) * 100 + "%";
    els.hueHandle.style.left = (pk.h / 360) * 100 + "%";
    const hex = hsvToHex(pk.h, pk.s, pk.v);
    els.pickerPreview.style.background = hex;
    els.svHandle.style.background = hex;
    if (document.activeElement !== els.hexInput) els.hexInput.value = hex;
    return hex;
  }
  const render = () => { paintSV(); reflect(); };

  // Pointer dragging: onMove(fractionX, fractionY) with values clamped 0..1.
  function drag(el, onMove) {
    const handle = (e) => {
      const r = el.getBoundingClientRect();
      onMove(clamp01((e.clientX - r.left) / r.width), clamp01((e.clientY - r.top) / r.height));
    };
    el.addEventListener("pointerdown", (e) => { el.setPointerCapture(e.pointerId); handle(e); el._d = true; });
    el.addEventListener("pointermove", (e) => { if (el._d) handle(e); });
    el.addEventListener("pointerup", () => { el._d = false; });
    el.addEventListener("pointercancel", () => { el._d = false; });
  }
  drag(els.svBox, (fx, fy) => { pk.s = fx; pk.v = 1 - fy; reflect(); });
  drag(els.hueSlider, (fx) => { pk.h = fx * 360; render(); });

  els.hexInput.addEventListener("input", (e) => {
    let v = e.target.value.trim();
    if (v && v[0] !== "#") v = "#" + v;
    if (HEX6.test(v)) { Object.assign(pk, hexToHsv(v)); render(); }
  });

  function open() {
    Object.assign(pk, hexToHsv(activeColor));
    els.pickerModal.hidden = false;
    render(); // no autofocus → mobile keyboard stays closed
    fit();
    window.visualViewport?.addEventListener("resize", fit);
  }
  function close() {
    els.pickerModal.hidden = true;
    els.pickerModal.style.top = "";
    els.pickerModal.style.height = "";
    window.visualViewport?.removeEventListener("resize", fit);
  }
  els.customSwatch.addEventListener("click", open);
  els.pickerCancel.addEventListener("click", close);
  els.pickerModal.addEventListener("click", (e) => { if (e.target === els.pickerModal) close(); });
  els.pickerUse.addEventListener("click", () => { setColor(hsvToHex(pk.h, pk.s, pk.v)); close(); });
}

// `v` is a cache key: the config `rev` for the cacheable initial load, or
// Date.now() to force a fresh copy after the user's own purchase.
async function loadBoard(width, height, v) {
  const res = await fetch(`/api/board?v=${encodeURIComponent(v)}`);
  const blob = await res.blob();
  const bmp = await createImageBitmap(blob);
  const off = document.createElement("canvas");
  off.width = width;
  off.height = height;
  const octx = off.getContext("2d");
  octx.drawImage(bmp, 0, 0);
  const data = octx.getImageData(0, 0, width, height).data;
  return { canvas: off, isTaken: (x, y) => data[(y * width + x) * 4 + 3] > 0 };
}

function hideTooltip() { els.tooltip.hidden = true; }

// Place the tooltip to the bottom-right of the tap, flipping to the left/top
// when it would overflow so it always stays fully on-screen.
function positionTooltip(sx, sy) {
  const gap = 12;
  const tw = els.tooltip.offsetWidth;
  const th = els.tooltip.offsetHeight;
  const vw = window.innerWidth, vh = window.innerHeight;
  let left = sx + gap;
  let top = sy + gap;
  if (left + tw > vw - 8) left = sx - gap - tw; // flip left
  if (left < 8) left = 8;
  if (top + th > vh - 8) top = sy - gap - th; // flip above
  if (top < 8) top = 8;
  els.tooltip.style.left = left + "px";
  els.tooltip.style.top = top + "px";
}

let ttToken = 0;
function showTooltip(x, y, sx, sy) {
  const token = ++ttToken;
  // Show immediately with a spinner, then fill in once the data arrives.
  els.ttContent.hidden = true;
  els.ttSpinner.hidden = false;
  els.tooltip.hidden = false;
  positionTooltip(sx, sy);

  fetch(`/api/pixel?x=${x}&y=${y}`, { cache: "no-store" })
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null)
    .then((data) => {
      if (token !== ttToken) return; // superseded by a newer tap
      els.ttDesc.textContent = (data && data.description) || "Owned pixel";
      const url = data && data.url;
      if (url && /^https?:\/\//i.test(url)) {
        els.ttLink.href = url;
        els.ttLink.textContent = url.replace(/^https?:\/\//, "");
        els.ttLink.hidden = false;
      } else {
        els.ttLink.hidden = true;
      }
      els.ttSpinner.hidden = true;
      els.ttContent.hidden = false;
      positionTooltip(sx, sy); // content changed size → re-place
    });
}

async function main() {
  buildSwatches();
  createPicker();
  setColor(activeColor);

  const cfg = await fetch("/api/config", { cache: "no-store" }).then((r) => r.json());
  const { width, height, testMode } = cfg;

  const selection = new Map(); // key = y*width+x → { x, y, color }
  let board = await loadBoard(width, height, cfg.rev); // cacheable initial load

  const view = createBoardView({
    canvasEl: els.canvas,
    width,
    height,
    selection,
    getBottomInset: () => els.bar.offsetHeight,
    onPixelClick: (x, y, sx, sy) => {
      hideTooltip();
      if (board.isTaken(x, y)) {
        view.setHighlight({ x, y }); // outline the pixel being inspected
        showTooltip(x, y, sx, sy); // owned → show its description + link
        return;
      }
      const k = y * width + x;
      const cur = selection.get(k);
      if (cur) {
        if (cur.color === activeColor) {
          selection.delete(k); // same colour → remove
          view.setHighlight(null);
        } else {
          cur.color = activeColor; // different colour → recolour, keep selected
          view.setHighlight({ x, y });
        }
        cart.refresh();
        return;
      }
      selection.set(k, { x, y, color: activeColor });
      view.setHighlight({ x, y });
      cart.refresh();
      view.zoomToPixel(x, y);
    },
  });

  const cart = createCart({
    selection,
    testMode,
    els,
    toast,
    render: () => view.render(),
    onAfterClaim: async () => {
      board = await loadBoard(width, height, Date.now()); // force-fresh after own purchase
      view.setBoard(board);
      view.setHighlight(null);
      cart.refresh();
    },
  });
  els.clearBtn.addEventListener("click", () => view.setHighlight(null));

  view.setBoard(board);
  view.resetView();
  cart.refresh();

  // ── Buy modal ──
  // Dismiss the tooltip as soon as the user starts a new gesture.
  els.canvas.addEventListener("pointerdown", hideTooltip);

  // Keep the modal centred in the visible area (above the mobile keyboard).
  function positionModal() {
    const vv = window.visualViewport;
    if (!vv) return;
    els.modal.style.top = vv.offsetTop + "px";
    els.modal.style.height = vv.height + "px";
  }
  function openModal() {
    hideTooltip();
    els.modalErr.textContent = "";
    els.modalContinue.textContent = `Buy $${selection.size}`;
    els.modal.hidden = false;
    positionModal();
    window.visualViewport?.addEventListener("resize", positionModal);
    window.visualViewport?.addEventListener("scroll", positionModal);
    els.descInput.focus();
  }
  function closeModal() {
    els.modal.hidden = true;
    els.modal.style.top = "";
    els.modal.style.height = "";
    window.visualViewport?.removeEventListener("resize", positionModal);
    window.visualViewport?.removeEventListener("scroll", positionModal);
  }

  els.buyBtn.addEventListener("click", () => {
    if (!selection.size) return;
    openModal();
  });
  els.modalCancel.addEventListener("click", closeModal);
  els.modal.addEventListener("click", (e) => { if (e.target === els.modal) closeModal(); });
  els.modalContinue.addEventListener("click", async () => {
    const description = els.descInput.value.trim();
    const link = normalizeUrl(els.urlInput.value); // URL is optional
    if (!description) { els.modalErr.textContent = "Please add a description."; return; }
    if (!link.ok) { els.modalErr.textContent = "That link doesn't look valid (e.g. example.com)."; return; }
    els.modalContinue.disabled = true;
    const { ok } = await cart.checkout({ description, url: link.url });
    els.modalContinue.disabled = false;
    if (ok) { closeModal(); els.descInput.value = ""; els.urlInput.value = ""; }
  });

  // Post-Stripe redirect feedback.
  const params = new URLSearchParams(location.search);
  if (params.get("status") === "success") {
    toast("Payment complete — your pixels are being placed! 🎉", "ok");
    setTimeout(async () => {
      board = await loadBoard(width, height, Date.now()); // force-fresh after payment
      view.setBoard(board);
    }, 1500);
    history.replaceState({}, "", location.pathname);
  } else if (params.get("status") === "cancel") {
    toast("Checkout cancelled — your selection is safe.", "");
    history.replaceState({}, "", location.pathname);
  }
}

main().catch((err) => {
  console.error(err);
  toast("Failed to load the board. Refresh to retry.", "err");
});
