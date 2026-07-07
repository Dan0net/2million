// Checkout controls: Clear / Buy / Rent buttons. Each of Buy/Rent triggers a
// checkout in its mode — claim for free in TEST MODE, otherwise a Stripe
// Checkout session (redirect to its URL).

export function createCart({ selection, testMode, els, toast, onAfterClaim, render }) {
  const fmt = (n) => "$" + n.toLocaleString("en-US");
  let busy = false;

  function refresh() {
    const n = selection.size;
    const disabled = n === 0 || busy;
    els.clearBtn.disabled = disabled;
    els.rentBtn.disabled = disabled;
    els.buyBtn.disabled = disabled;
    els.rentBtn.textContent = n ? `Rent · ${fmt(n)}/mo` : "Rent";
    els.buyBtn.textContent = n ? `Buy · ${fmt(n * 1000)}` : "Buy";
  }

  async function checkout(mode) {
    const pixels = [...selection.values()];
    if (!pixels.length || busy) return;
    busy = true;
    refresh();
    try {
      const endpoint = testMode ? "/api/claim" : "/api/checkout";
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pixels, mode }),
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
  });
  els.rentBtn.addEventListener("click", () => checkout("rent"));
  els.buyBtn.addEventListener("click", () => checkout("buy"));

  return { refresh };
}
