# 2 Million Dollar Homepage 🟥

A **1250×1600** grid — **2,000,000 pixels**, **$1 each, yours forever**. Pick a
colour, tap pixels, add a description (and an optional link), and buy. Tapping
an owned pixel shows its description and, if given, a clickable link.

- **No database, no Prisma.** The board is a single **PNG** stored in
  [Netlify Blobs](https://docs.netlify.com/blobs/overview/); the browser reads
  each pixel's alpha channel — **transparent (shown black) = buyable**, opaque =
  taken — so the page download stays tiny however many pixels sell.
- **Test mode is on by default**, so the deployed site works immediately with
  **no Stripe setup** — pixels are bought for free.
- Real payments use **Stripe Checkout** (one-time, $1 × pixel count).

## How it works

| Piece | What it is |
| --- | --- |
| `index.html`, `style.css`, `src/*.js` | Static frontend (vanilla JS + `<canvas>`, no build step). |
| `netlify/functions/board.js` | `GET /api/board` → the board PNG. |
| `netlify/functions/config.js` | `GET /api/config` → `{ testMode, width, height, price }`. |
| `netlify/functions/pixel.js` | `GET /api/pixel?x=&y=` → an owned pixel's `{ description, url, color }`. |
| `netlify/functions/claim.js` | `POST /api/claim` → **free** buy (test mode only). |
| `netlify/functions/checkout.js` | `POST /api/checkout` → creates a Stripe Checkout session. |
| `netlify/functions/webhook.js` | `POST /api/webhook` → the only thing that places paid pixels. |
| `netlify/functions/_lib/*` | Shared geometry/validation, storage, PNG, Stripe helpers. |

Storage (one Netlify Blobs store, `rentapixel`):

- `board.png` — the canonical image everyone sees. Updated **only when pixels
  are bought** (claim / webhook).
- `orders/<id>.json` — `{ id, pixels:[{x,y,color}], description, url, createdAt }`,
  the source of truth for each purchase (also powers the pixel tooltip). `url` may
  be empty (the link is optional; a bare domain is normalised to `https://`).
- `board.version` — a marker used for a one-time board reset (see `BOARD_VERSION`).
- `sessions/<id>.json` — a pending purchase stashed during Stripe checkout, read
  by the webhook.

## Deploy to Netlify

Runs on Netlify only (Functions + Blobs).

**Git-connected (recommended):** push the repo → Netlify **Add new site →
Import an existing project** → pick the repo/branch. Settings come from
`netlify.toml` (`publish = "."`, `functions = "netlify/functions"`; no build
command). Every push redeploys.

**CLI:** `npm i -g netlify-cli`, `netlify login`, `netlify init`,
`netlify deploy --build --prod`.

Netlify Blobs needs no configuration. On the default (test-mode) deploy you can
paint, add a description + link, and buy pixels for free — they persist for
everyone.

## Enabling real payments

By default `TEST_MODE` is on. To take real money:

1. **Register a webhook** (Stripe dashboard → Developers → Webhooks → Add
   endpoint): URL `https://<your-site>.netlify.app/api/webhook`, event
   **`checkout.session.completed`**. Copy the signing secret (`whsec_...`).
2. In Netlify → **Site configuration → Environment variables**, set:

   | Variable | Value |
   | --- | --- |
   | `TEST_MODE` | `false` |
   | `STRIPE_SECRET_KEY` | `sk_test_...` (or `sk_live_...`) |
   | `STRIPE_WEBHOOK_SECRET` | `whsec_...` |

3. **Redeploy** (env-var changes need a new deploy).

Checkout then redirects to Stripe. Test card `4242 4242 4242 4242`, any future
expiry / CVC. On success the webhook places the pixels — a one-time **$1 per
pixel**, permanent.

## Notes

- **Fulfilment is webhook-driven**, never the success redirect.
- Descriptions render as plain text and links are validated (`http`/`https`
  only, `rel="noopener"`) to avoid injection.
- **Double-sell:** pixels are checked at buy time. Without DB transactions a
  rare race is possible; per-order records keep data consistent (demo-grade).
- Board dimensions live in `netlify/functions/_lib/pixels.js` (`WIDTH`/`HEIGHT`).
