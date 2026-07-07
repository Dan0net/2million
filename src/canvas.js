// Circular board view: renders the board PNG + the pending selection, and
// handles pan / zoom / tap-to-paint. Board-pixel coordinates are integers in
// [0, width) × [0, height); the circle is centred at (width/2, height/2).

export function createBoardView({ canvasEl, width, height, radius, selection, onPixelClick }) {
  const ctx = canvasEl.getContext("2d");
  const cx = width / 2;
  const cy = height / 2;

  let board = null; // { canvas, isTaken(x,y) }
  let scale = 1;
  let offX = 0;
  let offY = 0;

  const MIN_SCALE = () => fitScale() * 0.9;
  const MAX_SCALE = 40;

  function fitScale() {
    const r = canvasEl.getBoundingClientRect();
    return Math.min(r.width, r.height) / width;
  }

  function resize() {
    const r = canvasEl.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvasEl.width = Math.round(r.width * dpr);
    canvasEl.height = Math.round(r.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function resetView() {
    resize();
    const r = canvasEl.getBoundingClientRect();
    scale = fitScale() * 0.92;
    offX = (r.width - width * scale) / 2;
    offY = (r.height - height * scale) / 2;
    render();
  }

  function clampScale(s) {
    return Math.max(MIN_SCALE(), Math.min(MAX_SCALE, s));
  }

  // screen (CSS px) → board pixel
  function toBoard(sx, sy) {
    return { x: Math.floor((sx - offX) / scale), y: Math.floor((sy - offY) / scale) };
  }

  function render() {
    const r = canvasEl.getBoundingClientRect();
    ctx.clearRect(0, 0, r.width, r.height);
    ctx.save();
    ctx.translate(offX, offY);
    ctx.scale(scale, scale);
    ctx.imageSmoothingEnabled = false;

    // Disc "paper" background.
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fillStyle = "#f6f7f9";
    ctx.fill();

    // Owned pixels + selection, clipped to the disc.
    ctx.save();
    ctx.clip();
    if (board) ctx.drawImage(board.canvas, 0, 0);
    for (const p of selection.values()) {
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x, p.y, 1, 1);
    }
    ctx.restore();

    // Faint grid once pixels are big enough to aim at.
    if (scale >= 8) {
      ctx.save();
      ctx.clip();
      ctx.beginPath();
      const r2 = canvasEl.getBoundingClientRect();
      const x0 = Math.max(0, Math.floor(-offX / scale));
      const y0 = Math.max(0, Math.floor(-offY / scale));
      const x1 = Math.min(width, Math.ceil((r2.width - offX) / scale));
      const y1 = Math.min(height, Math.ceil((r2.height - offY) / scale));
      for (let x = x0; x <= x1; x++) { ctx.moveTo(x, y0); ctx.lineTo(x, y1); }
      for (let y = y0; y <= y1; y++) { ctx.moveTo(x0, y); ctx.lineTo(x1, y); }
      ctx.lineWidth = 0.03;
      ctx.strokeStyle = "rgba(0,0,0,0.18)";
      ctx.stroke();
      ctx.restore();
    }

    // Disc border.
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.lineWidth = 1.5 / scale;
    ctx.strokeStyle = "rgba(255,255,255,0.35)";
    ctx.stroke();

    ctx.restore();
  }

  function setBoard(b) { board = b; render(); }

  function zoomAt(sx, sy, factor) {
    const next = clampScale(scale * factor);
    const f = next / scale;
    offX = sx - (sx - offX) * f;
    offY = sy - (sy - offY) * f;
    scale = next;
    render();
  }

  // ── Pointer handling: pan, tap-to-paint, pinch-zoom ──
  const pointers = new Map();
  let downPos = null;
  let moved = false;
  let pinchDist = 0;

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
      if (pinchDist > 0) zoomAt(mid.x, mid.y, dist / pinchDist);
      pinchDist = dist;
      moved = true;
      return;
    }

    // single-pointer pan
    const dx = p.x - prev.x;
    const dy = p.y - prev.y;
    if (Math.abs(p.x - downPos.x) > 3 || Math.abs(p.y - downPos.y) > 3) moved = true;
    offX += dx;
    offY += dy;
    render();
  });

  function endPointer(e) {
    if (!pointers.has(e.pointerId)) return;
    const p = pointers.get(e.pointerId);
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinchDist = 0;
    if (!moved && pointers.size === 0) {
      const { x, y } = toBoard(p.x, p.y);
      if (x >= 0 && x < width && y >= 0 && y < height) onPixelClick(x, y);
    }
  }
  canvasEl.addEventListener("pointerup", endPointer);
  canvasEl.addEventListener("pointercancel", endPointer);

  canvasEl.addEventListener("wheel", (e) => {
    e.preventDefault();
    const p = rel(e);
    zoomAt(p.x, p.y, e.deltaY < 0 ? 1.15 : 1 / 1.15);
  }, { passive: false });

  window.addEventListener("resize", resetView);

  return {
    render,
    resetView,
    setBoard,
    zoomBy: (f) => {
      const r = canvasEl.getBoundingClientRect();
      zoomAt(r.width / 2, r.height / 2, f);
    },
  };
}
