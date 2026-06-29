import { env } from "@/lib/env";

/**
 * Stripe billing — thin wrapper around the REST API to avoid a hard dependency
 * on the SDK for the MVP. Add the `stripe` package and swap these for the SDK
 * when expanding billing. Guarded so the app runs without keys.
 */
export async function createCheckoutSession(opts: {
  priceId: string;
  customerEmail: string;
  successUrl: string;
  cancelUrl: string;
}): Promise<{ url: string | null }> {
  const key = env.stripe.secretKey();
  if (!key) return { url: null };

  const body = new URLSearchParams({
    mode: "subscription",
    "line_items[0][price]": opts.priceId,
    "line_items[0][quantity]": "1",
    customer_email: opts.customerEmail,
    success_url: opts.successUrl,
    cancel_url: opts.cancelUrl,
  });

  const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      authorization: `Bearer ${key}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body,
  });
  if (!res.ok) throw new Error(`Stripe checkout failed: ${res.status}`);
  const data = await res.json();
  return { url: data.url };
}
