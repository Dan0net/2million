// Bootstraps Rent-a-Pixel with a mobile-first, progressive-disclosure flow:
//   idle      → only the title + canvas (pan/zoom freely)
//   picking   → first pixel tap reveals the sheet + colour palette; the tapped
//               pixel is held "pending" until a colour is chosen
//   building  → colour chosen; further taps place that colour instantly

import { createBoardView } from "./canvas.js";
import { createCart } from "./cart.js";

const PRESETS = [
  "#e63946", "#f77f00", "#fcbf49", "#ffd166", "#06d6a0", "#2a9d8f", "#118ab2", "#457b9d",
  "#3a0ca3", "#7209b7", "#b5179e", "#f72585", "#ff006e", "#ffffff", "#adb5bd", "#000000",
];

const els = {
  body: document.body,
  canvas: document.getElementById("board"),
  sheet: document.getElementById("sheet"),
  grip: document.getElementById("grip"),
  colorInput: document.getElementById("colorInput"),
  swatches: document.getElementById("swatches"),
  activeChip: document.getElementById("activeChip"),
  count: document.getElementById("count"),
  plural: document.getElementById("plural"),
  total: document.getElementById("total"),
  clearBtn: document.getElementById("clearBtn"),
  checkoutBtn: document.getElementById("checkoutBtn"),
  fineprint: document.getElementById("fineprint"),
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

// ── App state ──
let phase = "idle"; // idle | picking | building
let pending = null; // { x, y } awaiting a colour
let hasColour = false; // has the user chosen a colour this session?
let activeColor = els.colorInput.value;

// ── UI reveal helpers ──
function revealUI() {
  els.body.classList.remove("ui-idle");
  els.body.classList.add("ui-active");
}
function openPalette() { els.sheet.classList.add("colours-open"); }
function closePalette() { els.sheet.classList.remove("colours-open"); }
function collapseToIdle() {
  phase = "idle";
  pending = null;
  hasColour = false;
  view.setPending(null);
  closePalette();
  els.body.classList.remove("ui-active");
  els.body.classList.add("ui-idle");
}

// ── Colour selection ──
function reflectColour() {
  els.colorInput.value = activeColor;
  els.activeChip.style.background = activeColor;
  for (const b of els.swatches.children) {
    b.classList.toggle("active", b.dataset.color === activeColor.toLowerCase());
  }
}

function chooseColour(c) {
  activeColor = c;
  hasColour = true;
  reflectColour();
  if (pending) {
    // Commit the pixel that was waiting for a colour.
    selection.set(pending.y * W + pending.x, { x: pending.x, y: pending.y, color: c });
    pending = null;
    view.setPending(null);
    phase = "building";
    closePalette();
    view.render();
    cart.refresh();
  }
  // In building phase, just updates the colour used by future taps.
}

function buildSwatches() {
  for (const c of PRESETS) {
    const b = document.createElement("button");
    b.style.background = c;
    b.dataset.color = c.toLowerCase();
    b.title = c;
    b.addEventListener("click", () => chooseColour(c));
    els.swatches.appendChild(b);
  }
}
els.colorInput.addEventListener("input", (e) => chooseColour(e.target.value));

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

// These are assigned in main() but referenced by the helpers above.
let view;
let cart;
let W;

async function main() {
  buildSwatches();
  reflectColour();

  const cfg = await fetch("/api/config").then((r) => r.json());
  const { width, height, radius, testMode } = cfg;
  W = width;

  const selectionMap = new Map(); // key = y*width+x → { x, y, color }
  // expose to module scope for the helpers
  selection = selectionMap;

  let board = await loadBoard(width, height);

  view = createBoardView({
    canvasEl: els.canvas,
    width,
    height,
    radius,
    selection,
    onPixelClick: (x, y) => {
      const dx = x + 0.5 - width / 2;
      const dy = y + 0.5 - height / 2;
      if (dx * dx + dy * dy > radius * radius) return; // outside the circle
      if (board.isTaken(x, y)) {
        toast("That pixel is already taken.", "err");
        return;
      }
      const k = y * width + x;

      // Toggle off an already-selected pixel.
      if (selection.has(k)) {
        selection.delete(k);
        view.render();
        cart.refresh();
        return;
      }

      if (phase === "idle") revealUI();

      if (!hasColour) {
        // Hold the pixel pending and ask for a colour first.
        pending = { x, y };
        phase = "picking";
        openPalette();
        view.setPending(pending);
        requestAnimationFrame(() =>
          view.ensurePixelVisible(x, y, els.sheet.getBoundingClientRect().height)
        );
      } else {
        // Colour already chosen — place instantly.
        selection.set(k, { x, y, color: activeColor });
        phase = "building";
        view.render();
        cart.refresh();
      }
    },
  });

  cart = createCart({
    selection,
    testMode,
    els,
    toast,
    render: () => view.render(),
    onClear: () => collapseToIdle(),
    onAfterClaim: async () => {
      board = await loadBoard(width, height);
      view.setBoard(board);
      cart.refresh();
      collapseToIdle();
    },
  });

  view.setBoard(board);
  view.resetView();
  cart.refresh();

  // Grip + active-colour chip toggle the palette.
  els.grip.addEventListener("click", () => els.sheet.classList.toggle("colours-open"));
  els.activeChip.addEventListener("click", () => openPalette());

  els.zoomIn.addEventListener("click", () => view.zoomBy(1.4));
  els.zoomOut.addEventListener("click", () => view.zoomBy(1 / 1.4));
  els.zoomReset.addEventListener("click", () => view.resetView());

  // Post-Stripe redirect feedback.
  const params = new URLSearchParams(location.search);
  if (params.get("status") === "success") {
    revealUI();
    toast("Payment complete — your pixels are being placed! 🎉", "ok");
    setTimeout(async () => {
      board = await loadBoard(width, height);
      view.setBoard(board);
      collapseToIdle();
    }, 1500);
    history.replaceState({}, "", location.pathname);
  } else if (params.get("status") === "cancel") {
    toast("Checkout cancelled — your selection is safe.", "");
    history.replaceState({}, "", location.pathname);
  }
}

// `selection` is created inside main() but the colour helpers close over it.
let selection;

main().catch((err) => {
  console.error(err);
  toast("Failed to load the board. Refresh to retry.", "err");
});
