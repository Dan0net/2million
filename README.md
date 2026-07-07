# Rent-a-Pixel 🔴

A giant **circular** canvas of ~2,010,619 pixels. Pick a colour, click pixels,
and either **rent** them for **$1 / month** or **buy** them for life for **$1000**.
Owned pixels show up for everyone.

- **No database, no Prisma.** The board is a single **PNG** stored in
  [Netlify Blobs](https://docs.netlify.com/blobs/overview/); the browser reads
  each pixel's alpha channel — **transparent = buyable**, opaque = taken — so the
  page download stays tiny no matter how many pixels sell.
- **Test mode is on by default**, so the deployed site works immediately with
  **no Stripe setup** — pixels are claimed for free.
- Payments use **Stripe Checkout** (rent = subscription, buy = one-time).

## How it works

| Piece | What it is |
| --- | --- |
| `index.html`, `style.css`, `src/*.js` | The static frontend (vanilla JS + `<canvas>`, no build step). |
| `netlify/functions/board.js` | `GET /api/board` → the board PNG. |
| `netlify/functions/config.js` | `GET /api/config` → `{ testMode, width, height, radius }`. |
| `netlify/functions/claim.js` | `POST /api/claim` → **free** pixel claim (test mode only). |
| `netlify/functions/checkout.js` | `POST /api/checkout` → creates a Stripe Checkout session. |
| `netlify/functions/webhook.js` | `POST /api/webhook` → Stripe events; the only thing that places paid pixels. |
| `netlify/functions/sweep.js` | Hourly job: rebuilds the board and frees lapsed rentals. |
| `netlify/functions/_lib/*` | Shared geometry, storage, PNG, and Stripe helpers. |

Storage (all in one Netlify Blobs store named `rentapixel`):

- `board.png` — the canonical image everyone sees (a *derived* artifact).
- `orders/<id>.json` — source of truth for each claim/purchase (who, colours, rent expiry).
- `sessions/<id>.json` — pixels stashed during a Stripe checkout, read by the webhook.
- `subs/<subId>.json` — maps a Stripe subscription back to its order.

## Deploy to Netlify

You can only run this on Netlify (it relies on Netlify Functions + Blobs).

### Option A — Git-connected (recommended)

1. Push this repo to GitHub/GitLab/Bitbucket.
2. In Netlify: **Add new site → Import an existing project** → pick the repo/branch.
3. Leave the build settings as detected — everything comes from `netlify.toml`
   (`publish = "."`, `functions = "netlify/functions"`; no build command needed).
   Netlify installs the function dependencies automatically.
4. Deploy. Every push to the branch redeploys.

### Option B — CLI

```bash
npm install -g netlify-cli
netlify login
netlify init          # link or create a site
netlify deploy --build --prod
```

**Netlify Blobs needs no configuration** — it's automatically available to the
functions on any deploy. The hourly `sweep` scheduled function is registered
automatically from its `export const config = { schedule: "@hourly" }`.

Open the site — you'll see the circle and a **TEST MODE** banner. Paint pixels,
click **Claim**, and they persist for everyone. That's the whole app in free mode.

## Enabling real payments

By default `TEST_MODE` is on. To take real money:

1. **Create a rent Price** in the Stripe dashboard: a **recurring** price of
   **$1.00 / month**. Copy its ID (`price_...`).
2. **Register a webhook** (Developers → Webhooks → Add endpoint):
   - URL: `https://<your-site>.netlify.app/api/webhook`
   - Events: `checkout.session.completed`, `invoice.paid`, `customer.subscription.deleted`
   - Copy the **Signing secret** (`whsec_...`).
3. In Netlify → **Site configuration → Environment variables**, set:

   | Variable | Value |
   | --- | --- |
   | `TEST_MODE` | `false` |
   | `STRIPE_SECRET_KEY` | `sk_test_...` (or `sk_live_...`) |
   | `STRIPE_WEBHOOK_SECRET` | `whsec_...` |
   | `STRIPE_RENT_PRICE_ID` | `price_...` |

4. **Redeploy** (env-var changes need a new deploy).

Now checkout redirects to Stripe. Test with card `4242 4242 4242 4242`, any
future expiry / CVC. On success the webhook places the pixels; renting starts a
$1/month subscription, buying is a one-time $1000 charge.

### Rent lifecycle

- Each `invoice.paid` pushes the rental's `expiresAt` to the new period end.
- Cancelling the subscription (`customer.subscription.deleted`) frees the pixels.
- The hourly `sweep` is a backstop: it rebuilds the board and drops any rental
  whose `expiresAt` has passed — so a lapsed rental frees up **within an hour**,
  not to-the-second.

## Notes & limitations

- **Fulfilment is webhook-driven**, never the success redirect (a user can close
  the tab or reach the success page without paying).
- **Double-sell:** pixels are checked at checkout time. Without DB transactions a
  rare race is possible; per-order records + the hourly rebuild keep data
  consistent (this is demo-grade, not bank-grade).
- Board dimensions live in `netlify/functions/_lib/pixels.js` (`WIDTH`/`HEIGHT`).
