// Checkout controls: Clear + Buy. Buy always costs $1/pixel. The description +
// URL are collected by the modal (in main.js) and passed to checkout(meta).
// Test mode claims for free via /api/claim; otherwise a Stripe session.

export function createCart({ selection, testMode, els, toast, onAfterClaim, render }) {
  const fmt = (n) => "$" + n.toLocaleString("en-US");
  let busy = false;

  function refresh() {
    const n = selection.size;
    els.bar.hidden = n === 0; // bar shows only once a pixel is selected
    els.clearBtn.disabled = n === 0 || busy;
    els.buyBtn.disabled = n === 0 || busy;
    els.buyBtn.textContent = n ? `Buy · ${fmt(n)}` : "Buy";
  }

  async function checkout({ description, url }) {
    const pixels = [...selection.values()];
    if (!pixels.length || busy) return { ok: false };
    busy = true;
    refresh();
    try {
      const endpoint = testMode ? "/api/claim" : "/api/checkout";
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pixels, description, url }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        if (data.conflicts?.length) {
          for (const c of data.conflicts) selection.delete(c.y * data.width + c.x);
          render();
          toast(`${data.conflicts.length} pixel(s) were just taken and were removed.`, "err");
        } else {
          toast(data.error || "Something went wrong. Try again.", "err");
        }
        return { ok: false };
      }

      if (testMode) {
        selection.clear();
        toast(`Bought ${pixels.length} pixel${pixels.length === 1 ? "" : "s"}! 🎉`, "ok");
        await onAfterClaim();
      } else if (data.url) {
        window.location = data.url; // → Stripe Checkout
      }
      return { ok: true };
    } catch (err) {
      toast("Network error. Try again.", "err");
      return { ok: false };
    } finally {
      busy = false;
      refresh();
    }
  }

  els.clearBtn.addEventListener("click", () => {
    selection.clear();
    render();
    refresh();
  });

  return { refresh, checkout };
}
