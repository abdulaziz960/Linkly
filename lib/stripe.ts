/**
 * Stripe Checkout integration, used only as a test-mode payment gateway
 * while the real gateway (Moyasar) is pending business verification. We
 * never touch card details ourselves - Stripe hosts the checkout page.
 * Nothing here runs until STRIPE_SECRET_KEY is set.
 */
type CreateCheckoutInput = {
  amount: number; // SAR
  description: string;
  successUrl: string;
  cancelUrl: string;
  metadata?: Record<string, string>;
};

type StripeCheckoutSession = {
  id: string;
  url: string;
};

type StripeCheckoutSessionStatus = {
  id: string;
  paymentStatus: string;
};

function stripeSecretKey() {
  return process.env.STRIPE_SECRET_KEY?.trim() || "";
}

export function isStripeConfigured() {
  return Boolean(stripeSecretKey());
}

export async function createStripeCheckoutSession(input: CreateCheckoutInput): Promise<StripeCheckoutSession> {
  const secretKey = stripeSecretKey();
  if (!secretKey) throw new Error("STRIPE_NOT_CONFIGURED");

  const params = new URLSearchParams();
  params.set("mode", "payment");
  params.set("success_url", input.successUrl);
  params.set("cancel_url", input.cancelUrl);
  params.set("line_items[0][quantity]", "1");
  params.set("line_items[0][price_data][currency]", "sar");
  params.set("line_items[0][price_data][unit_amount]", String(Math.round(input.amount * 100)));
  params.set("line_items[0][price_data][product_data][name]", input.description);
  for (const [key, value] of Object.entries(input.metadata || {})) {
    params.set(`metadata[${key}]`, value);
  }

  const response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secretKey}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: params.toString()
  });

  const payload = (await response.json().catch(() => null)) as {
    id?: string;
    url?: string;
    error?: { message?: string };
  } | null;

  if (!response.ok || !payload?.id || !payload.url) {
    console.error("Stripe checkout session creation failed", payload);
    throw new Error(payload?.error?.message || "STRIPE_CHECKOUT_FAILED");
  }

  return { id: payload.id, url: payload.url };
}

export async function retrieveStripeCheckoutSession(sessionId: string): Promise<StripeCheckoutSessionStatus> {
  const secretKey = stripeSecretKey();
  if (!secretKey) throw new Error("STRIPE_NOT_CONFIGURED");

  const response = await fetch(`https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}`, {
    headers: { Authorization: `Bearer ${secretKey}` }
  });

  const payload = (await response.json().catch(() => null)) as { id?: string; payment_status?: string } | null;
  if (!response.ok || !payload?.id) {
    console.error("Stripe checkout session lookup failed", payload);
    throw new Error("STRIPE_SESSION_LOOKUP_FAILED");
  }

  return { id: payload.id, paymentStatus: payload.payment_status || "unpaid" };
}
