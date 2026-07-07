// Stripe SDK singleton + shared config. Only used when TEST_MODE is off.

import Stripe from "stripe";

export const TEST_MODE = process.env.TEST_MODE !== "false"; // default ON

export const PRICE_LIFETIME_CENTS = 100000; // $1000.00 per pixel, one-time
export const PRICE_RENT_DOLLARS = 1; // $1 / month per pixel (via STRIPE_RENT_PRICE_ID)

let _stripe;
export function stripe() {
  if (!_stripe) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) throw new Error("STRIPE_SECRET_KEY is not set.");
    _stripe = new Stripe(key);
  }
  return _stripe;
}

// Base URL of the deployed site (Netlify provides URL / DEPLOY_PRIME_URL).
export function siteUrl() {
  return (
    process.env.URL ||
    process.env.DEPLOY_PRIME_URL ||
    "http://localhost:8888"
  );
}
