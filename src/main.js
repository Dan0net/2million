// Bootstraps Rent-a-Pixel. The control bar is always visible: pick a colour,
// tap pixels (each tap places the active colour and zooms in to reveal it),
// then hit Rent or Buy.

import { createBoardView } from "./canvas.js";
import { createCart } from "./cart.js";

const PRESETS = [
  "#e63946", "#f77f00", "#fcbf49", "#ffd166", "#06d6a0", "#2a9d8f", "#118ab2", "#457b9d",
  "#3a0ca3", "#7209b7", "#b5179e", "#f72585", "#ff006e", "#ffffff", "#adb5bd", "#000000",
];

const els = {
  topbar: document.getElementById("topbar"),
  canvas: document.getElementById("board"),
  bar: document.getElementById("bar"),
  swatches: document.getElementById("swatches"),
  colorInput: document.getElementById("colorInput"),
  clearBtn: document.getElementById("clearBtn"),
  buyBtn: document.getElementById("buyBtn"),
  rentBtn: document.getElementById("rentBtn"),
  toast: document.getElementById("toast"),
  zoomIn: document.getElementById("zoomIn"),
  zoomOut: document.getElementById("zoomOut"),
  zoomReset: document.getElementById("zoomReset"),
};

let toastTimer;
function toast(msg, kind = "") {
  els.toast.textContent = msg;
  els.toast.className = "toast show " + kind;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (els.toast.className = "toast " + kind), 3200);
}

// Active paint colour (defaults to the first swatch).
let activeColor = PRESETS[0];
function setColor(c) {
  activeColor = c;
  els.colorInput.value = c;
  for (const b of els.swatches.querySelectorAll("button")) {
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
    // Presets sit before the custom colour input so they share one row.
    els.swatches.insertBefore(b, els.colorInput.parentElement);
  }
}
els.colorInput.addEventListener("input", (e) => setColor(e.target.value));

// Fetch the board PNG → { canvas, isTaken }.
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

async function main() {
  buildSwatches();
  setColor(activeColor);

  const cfg = await fetch("/api/config").then((r) => r.json());
  const { width, height, radius, testMode } = cfg;

  const selection = new Map(); // key = y*width+x → { x, y, color }
  let board = await loadBoard(width, height);

  const view = createBoardView({
    canvasEl: els.canvas,
    width,
    height,
    radius,
    selection,
    getTopInset: () => els.topbar.offsetHeight,
    getBottomInset: () => els.bar.offsetHeight,
    onPixelClick: (x, y) => {
      const dx = x + 0.5 - width / 2;
      const dy = y + 0.5 - height / 2;
      if (dx * dx + dy * dy > radius * radius) return; // outside the circle
      if (board.isTaken(x, y)) {
        toast("That pixel is already taken.", "err");
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
      view.zoomToPixel(x, y); // zoom in so the new colour is visible
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

  els.zoomIn.addEventListener("click", () => view.zoomBy(1.4));
  els.zoomOut.addEventListener("click", () => view.zoomBy(1 / 1.4));
  els.zoomReset.addEventListener("click", () => view.resetView());

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
