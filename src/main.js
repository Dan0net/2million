// Bootstraps the 2 Million Dollar Homepage. Pick a colour, tap pixels (each
// tap places the active colour and gently zooms in), then Buy — which asks for
// a description + link. Tapping an owned pixel shows its description + link.

import { createBoardView } from "./canvas.js";
import { createCart } from "./cart.js";

const PRESETS = [
  "#e63946", "#f77f00", "#fcbf49", "#ffd166", "#06d6a0", "#2a9d8f", "#118ab2", "#457b9d",
  "#3a0ca3", "#7209b7", "#b5179e", "#f72585", "#ff006e", "#ffffff", "#adb5bd", "#000000",
];

const els = {
  canvas: document.getElementById("board"),
  bar: document.getElementById("bar"),
  swatches: document.getElementById("swatches"),
  clearBtn: document.getElementById("clearBtn"),
  buyBtn: document.getElementById("buyBtn"),
  toast: document.getElementById("toast"),
  tooltip: document.getElementById("tooltip"),
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

// Active paint colour (defaults to the first swatch).
let activeColor = PRESETS[0];
function setColor(c) {
  activeColor = c;
  for (const b of els.swatches.children) {
    b.classList.toggle("active", b.dataset.color === c.toLowerCase());
  }
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

async function loadBoard(width, height) {
  const res = await fetch("/api/board", { cache: "no-store" });
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

async function showTooltip(x, y, sx, sy) {
  let data = null;
  try {
    const res = await fetch(`/api/pixel?x=${x}&y=${y}`, { cache: "no-store" });
    if (res.ok) data = await res.json();
  } catch { /* ignore */ }
  if (!data) return;
  els.ttDesc.textContent = data.description || "";
  if (data.url && /^https?:\/\//i.test(data.url)) {
    els.ttLink.href = data.url;
    els.ttLink.textContent = data.url.replace(/^https?:\/\//, "");
    els.ttLink.hidden = false;
  } else {
    els.ttLink.hidden = true;
  }

  // Show, then keep it fully on-screen: flip below the tap when there's no
  // room above (board is flush to the top), and clamp horizontally.
  els.tooltip.classList.remove("below");
  els.tooltip.style.left = sx + "px";
  els.tooltip.style.top = sy + "px";
  els.tooltip.hidden = false;
  const tw = els.tooltip.offsetWidth;
  const th = els.tooltip.offsetHeight;
  if (sy - th - 12 < 8) els.tooltip.classList.add("below");
  const vw = window.innerWidth;
  els.tooltip.style.left = Math.min(Math.max(sx, 8 + tw / 2), vw - 8 - tw / 2) + "px";
}

async function main() {
  buildSwatches();
  setColor(activeColor);

  const cfg = await fetch("/api/config").then((r) => r.json());
  const { width, height, testMode } = cfg;

  const selection = new Map(); // key = y*width+x → { x, y, color }
  let board = await loadBoard(width, height);

  const view = createBoardView({
    canvasEl: els.canvas,
    width,
    height,
    selection,
    getBottomInset: () => (els.bar.hidden ? 0 : els.bar.offsetHeight),
    onPixelClick: (x, y, sx, sy) => {
      hideTooltip();
      if (board.isTaken(x, y)) {
        showTooltip(x, y, sx, sy); // owned → show its description + link
        return;
      }
      const k = y * width + x;
      if (selection.has(k)) {
        selection.delete(k); // toggle off
        view.render();
        cart.refresh();
        return;
      }
      selection.set(k, { x, y, color: activeColor });
      view.render();
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
      board = await loadBoard(width, height);
      view.setBoard(board);
      cart.refresh();
    },
  });

  view.setBoard(board);
  view.resetView();
  cart.refresh();

  // ── Buy modal ──
  // Dismiss the tooltip as soon as the user starts a new gesture.
  els.canvas.addEventListener("pointerdown", hideTooltip);

  function openModal() {
    hideTooltip();
    els.modalErr.textContent = "";
    els.modalContinue.textContent = `Buy $${selection.size}`;
    els.modal.hidden = false;
    els.descInput.focus();
  }
  function closeModal() { els.modal.hidden = true; }

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
      board = await loadBoard(width, height);
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
