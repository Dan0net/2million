// Rectangular board view: renders the board (black, with owned pixels + the
// pending selection) and handles pan / zoom / tap. Board-pixel coordinates are
// integers in [0, width) × [0, height). Everything outside the board shows the
// grey page background.

export function createBoardView({
  canvasEl, width, height, selection, onPixelClick,
  getTopInset = () => 0, getBottomInset = () => 0,
}) {
  const ctx = canvasEl.getContext("2d");

  const VISIBLE_SCALE = 18; // scale at which individual pixels read clearly

  let board = null; // { canvas, isTaken(x,y) }
  let highlight = null; // the single currently-tapped pixel { x, y }, outlined
  let scale = 1;
  let offX = 0;
  let offY = 0;

  // Never zoom out past the initial fill-width scale, so the board always
  // fills the viewport width.
  const MIN_SCALE = () => canvasEl.getBoundingClientRect().width / width;
  const MAX_SCALE = 48;

  function availHeight(r) { return r.height - getTopInset() - getBottomInset(); }

  function resize() {
    const r = canvasEl.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvasEl.width = Math.round(r.width * dpr);
    canvasEl.height = Math.round(r.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  // Fill the viewport width, flush to the top-left (no side/top margin). The
  // board is shorter than a tall phone at this scale, so a gap sits at the
  // bottom; a taller-than-viewport board is pannable.
  function resetView() {
    resize();
    const r = canvasEl.getBoundingClientRect();
    scale = r.width / width;
    offX = 0;
    offY = 0;
    render();
  }

  function clampScale(s) { return Math.max(MIN_SCALE(), Math.min(MAX_SCALE, s)); }

  // Keep the board covering the window: never pan past its edges. Horizontally
  // the board always fills the width; vertically the top stays flush (a shorter
  // board keeps its bottom gap), and a taller board can pan down to its bottom.
  function clampFor(s, ox, oy) {
    const r = canvasEl.getBoundingClientRect();
    const bw = width * s, bh = height * s;
    const minX = Math.min(0, r.width - bw);
    const minY = Math.min(0, r.height - bh);
    return {
      ox: Math.min(0, Math.max(minX, ox)),
      oy: Math.min(0, Math.max(minY, oy)),
    };
  }
  function clampOffsets() { ({ ox: offX, oy: offY } = clampFor(scale, offX, offY)); }

  // screen (CSS px) → board pixel
  function toBoard(sx, sy) {
    return { x: Math.floor((sx - offX) / scale), y: Math.floor((sy - offY) / scale) };
  }

  function render() {
    const r = canvasEl.getBoundingClientRect();
    ctx.clearRect(0, 0, r.width, r.height); // outside the board = grey page bg
    ctx.save();
    ctx.translate(offX, offY);
    ctx.scale(scale, scale);
    ctx.imageSmoothingEnabled = false;

    // Board: empty pixels are black.
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, width, height);

    // Owned pixels (from the PNG) + the pending selection.
    if (board) ctx.drawImage(board.canvas, 0, 0);
    for (const p of selection.values()) {
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x, p.y, 1, 1);
    }

    // Faint grid once pixels are big enough to aim at.
    if (scale >= 8) {
      ctx.beginPath();
      const x0 = Math.max(0, Math.floor(-offX / scale));
      const y0 = Math.max(0, Math.floor(-offY / scale));
      const x1 = Math.min(width, Math.ceil((r.width - offX) / scale));
      const y1 = Math.min(height, Math.ceil((r.height - offY) / scale));
      for (let x = x0; x <= x1; x++) { ctx.moveTo(x, y0); ctx.lineTo(x, y1); }
      for (let y = y0; y <= y1; y++) { ctx.moveTo(x0, y); ctx.lineTo(x1, y); }
      ctx.lineWidth = 0.04;
      ctx.strokeStyle = "rgba(255,255,255,0.12)";
      ctx.stroke();
    }

    // Subtle board border against the grey surround.
    ctx.lineWidth = 1 / scale;
    ctx.strokeStyle = "rgba(255,255,255,0.25)";
    ctx.strokeRect(0, 0, width, height);

    // Outline just the currently-tapped pixel (selection or tooltip target).
    if (highlight) {
      ctx.lineWidth = 3 / scale;
      ctx.strokeStyle = "#000";
      ctx.strokeRect(highlight.x, highlight.y, 1, 1);
      ctx.lineWidth = 1.5 / scale;
      ctx.strokeStyle = "#fff";
      ctx.strokeRect(highlight.x, highlight.y, 1, 1);
    }

    ctx.restore();
  }

  function setBoard(b) { board = b; render(); }
  function setHighlight(p) { highlight = p; render(); }

  // Pan so board pixel (x,y) sits comfortably above the bottom bar.
  function ensurePixelVisible(x, y, bottomInset = 0) {
    const r = canvasEl.getBoundingClientRect();
    const sy = offY + (y + 0.5) * scale;
    const limit = r.height - bottomInset - 24;
    if (sy > limit) { offY -= sy - limit; render(); }
    else if (sy < 80) { offY += 80 - sy; render(); }
  }

  // Animate scale/offset toward targets (ease-out).
  let animId = 0;
  function animateTo(tScale, tOffX, tOffY, ms) {
    cancelAnimationFrame(animId);
    const sScale = scale, sOffX = offX, sOffY = offY;
    let start = null;
    function step(ts) {
      if (start === null) start = ts;
      const t = Math.min(1, (ts - start) / ms);
      const e = 1 - Math.pow(1 - t, 3);
      scale = sScale + (tScale - sScale) * e;
      offX = sOffX + (tOffX - sOffX) * e;
      offY = sOffY + (tOffY - sOffY) * e;
      render();
      if (t < 1) animId = requestAnimationFrame(step);
    }
    animId = requestAnimationFrame(step);
  }

  // Tapping a pixel: gently zoom in and centre it so the new colour is visible.
  function zoomToPixel(x, y) {
    if (scale >= VISIBLE_SCALE) {
      ensurePixelVisible(x, y, getBottomInset());
      return;
    }
    const r = canvasEl.getBoundingClientRect();
    const target = VISIBLE_SCALE;
    const centreX = r.width / 2;
    const centreY = getTopInset() + availHeight(r) / 2;
    const t = clampFor(target, centreX - (x + 0.5) * target, centreY - (y + 0.5) * target);
    animateTo(target, t.ox, t.oy, 650);
  }

  function zoomAt(sx, sy, factor) {
    cancelAnimationFrame(animId);
    const next = clampScale(scale * factor);
    const f = next / scale;
    offX = sx - (sx - offX) * f;
    offY = sy - (sy - offY) * f;
    scale = next;
    clampOffsets();
    render();
  }

  // ── Pointer handling: pan, tap, pinch (zoom + pan together) ──
  const pointers = new Map();
  let downPos = null;
  let moved = false;
  let pinchDist = 0;
  let prevMid = null;

  function rel(e) {
    const r = canvasEl.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  canvasEl.addEventListener("pointerdown", (e) => {
    canvasEl.setPointerCapture(e.pointerId);
    const p = rel(e);
    pointers.set(e.pointerId, p);
    downPos = p;
    moved = false;
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
      prevMid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    }
  });

  canvasEl.addEventListener("pointermove", (e) => {
    if (!pointers.has(e.pointerId)) return;
    const prev = pointers.get(e.pointerId);
    const p = rel(e);
    pointers.set(e.pointerId, p);

    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      if (pinchDist > 0) {
        const next = clampScale(scale * (dist / pinchDist));
        const f = next / scale;
        offX = mid.x - (mid.x - offX) * f;
        offY = mid.y - (mid.y - offY) * f;
        scale = next;
      }
      if (prevMid) { offX += mid.x - prevMid.x; offY += mid.y - prevMid.y; }
      prevMid = mid;
      pinchDist = dist;
      moved = true;
      clampOffsets();
      render();
      return;
    }

    const dx = p.x - prev.x;
    const dy = p.y - prev.y;
    if (Math.abs(p.x - downPos.x) > 3 || Math.abs(p.y - downPos.y) > 3) moved = true;
    offX += dx;
    offY += dy;
    clampOffsets();
    render();
  });

  function endPointer(e) {
    if (!pointers.has(e.pointerId)) return;
    const p = pointers.get(e.pointerId);
    pointers.delete(e.pointerId);
    if (pointers.size < 2) { pinchDist = 0; prevMid = null; }
    if (!moved && pointers.size === 0) {
      const { x, y } = toBoard(p.x, p.y);
      if (x >= 0 && x < width && y >= 0 && y < height) onPixelClick(x, y, p.x, p.y);
    }
  }
  canvasEl.addEventListener("pointerup", endPointer);
  canvasEl.addEventListener("pointercancel", endPointer);

  canvasEl.addEventListener("wheel", (e) => {
    e.preventDefault();
    const p = rel(e);
    zoomAt(p.x, p.y, e.deltaY < 0 ? 1.15 : 1 / 1.15);
  }, { passive: false });

  // On resize (incl. the mobile keyboard opening) keep the current zoom/pan —
  // only re-sync the backing store. Never re-fit, which would reset the zoom.
  window.addEventListener("resize", () => {
    resize();
    scale = Math.max(scale, MIN_SCALE());
    clampOffsets();
    render();
  });

  return { render, resetView, setBoard, setHighlight, zoomToPixel };
}
