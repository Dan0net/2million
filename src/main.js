// Bootstraps the 2 Million Dollar Homepage. Pick a colour, tap pixels (each
// tap places the active colour and gently zooms in), then Buy — which asks for
// a description + link. Tapping an owned pixel shows its description + link.

import { createBoardView } from "./canvas.js";
import { createCart } from "./cart.js";

// r/place-style palette: saturated, even hue coverage, real blues, greyscale ramp.
const PRESETS = [
  "#6d001a", "#be0039", "#ff4500", "#ffa800", "#ffd635", "#fff8b8",
  "#00a368", "#00cc78", "#7eed56", "#00756f", "#009eaa", "#00ccc0",
  "#2450a4", "#3690ea", "#51e9f4", "#493ac1", "#6a5cff", "#94b3ff",
  "#811e9f", "#b44ac0", "#e4abff", "#de107f", "#ff3881", "#ff99aa",
  "#6d482f", "#9c6926", "#ffb470", "#000000", "#515252", "#898d90", "#d4d7d9", "#ffffff",
];

const els = {
  canvas: document.getElementById("board"),
  bar: document.getElementById("bar"),
  swatches: document.getElementById("swatches"),
  clearBtn: document.getElementById("clearBtn"),
  buyBtn: document.getElementById("buyBtn"),
  toast: document.getElementById("toast"),
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
