// Cart panel: shows the running total, rent/buy mode, and drives checkout.
// In TEST MODE it claims pixels for free via /api/claim; otherwise it creates
// a Stripe Checkout session via /api/checkout and redirects to it.

export function createCart({ selection, testMode, els, toast, onAfterClaim, render, onClear }) {
  function mode() {
    return document.querySelector('input[name="mode"]:checked').value; // "rent" | "buy"
  }

  function fmt(n) {
    return "$" + n.toLocaleString("en-US");
  }

  function refresh() {
    const n = selection.size;
    els.count.textContent = String(n);
    els.plural.textContent = n === 1 ? "" : "s";

    const m = mode();
    els.total.textContent = m === "rent" ? `${fmt(n)}/mo` : fmt(n * 1000);

    els.clearBtn.disabled = n === 0;
    els.checkoutBtn.disabled = n === 0 || busy;

    if (n === 0) {
      els.checkoutBtn.textContent = "Select some pixels";
      els.fineprint.textContent = "";
    } else if (testMode) {
      els.checkoutBtn.textContent = busy ? "Claiming…" : `Claim ${n} pixel${n === 1 ? "" : "s"} (free)`;
      els.fineprint.textContent = "Test mode: no payment — pixels are claimed instantly.";
    } else if (m === "rent") {
      els.checkoutBtn.textContent = busy ? "Redirecting…" : `Rent ${n} · ${fmt(n)}/mo`;
      els.fineprint.textContent = "You'll be sent to Stripe to start a $1/month-per-pixel subscription.";
    } else {
      els.checkoutBtn.textContent = busy ? "Redirecting…" : `Buy ${n} · ${fmt(n * 1000)}`;
      els.fineprint.textContent = "You'll be sent to Stripe for a one-time payment. Yours forever.";
    }
  }

  let busy = false;

  async function checkout() {
    const pixels = [...selection.values()];
    if (!pixels.length || busy) return;
    busy = true;
    refresh();
    try {
      const endpoint = testMode ? "/api/claim" : "/api/checkout";
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pixels, mode: mode() }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        if (data.conflicts?.length) {
          for (const c of data.conflicts) selection.delete(c.y * data.width + c.x);
          toast(`${data.conflicts.length} pixel(s) were just taken and were removed from your selection.`, "err");
        } else {
          toast(data.error || "Something went wrong. Try again.", "err");
        }
        return;
      }

      if (testMode) {
        selection.clear();
        toast(`Claimed ${pixels.length} pixel${pixels.length === 1 ? "" : "s"}! 🎉`, "ok");
        await onAfterClaim();
      } else if (data.url) {
        window.location = data.url; // → Stripe Checkout
      } else {
        toast("Could not start checkout.", "err");
      }
    } catch (err) {
      toast("Network error. Try again.", "err");
    } finally {
      busy = false;
      refresh();
    }
  }

  els.clearBtn.addEventListener("click", () => {
    selection.clear();
    render();
    refresh();
    onClear?.();
  });
  els.checkoutBtn.addEventListener("click", checkout);
  for (const r of document.querySelectorAll('input[name="mode"]')) {
    r.addEventListener("change", refresh);
  }

  return { refresh };
}
