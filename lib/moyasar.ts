/**
 * Moyasar hosted-invoice integration. We never touch card details
 * ourselves - Moyasar hosts the payment page and calls our webhook when
 * the invoice's status changes. Nothing here runs until MOYASAR_SECRET_KEY
 * is set in the environment; until then createMoyasarInvoice throws a
 * clear "not configured" error the API route turns into a friendly message.
 */
import { timingSafeEqual } from "crypto";
import type { PaymentKind } from "./payment-status";

/** Name stamped on every payment request's metadata so gateway records are attributable to this platform. */
export const PAYMENT_PLATFORM_NAME = "Linkly";
export const PAYMENT_PLATFORM_DOMAIN = "linklysa.io";

type CreateInvoiceInput = {
  amount: number; // SAR
  amountHalalas?: number;
  description: string;
  callbackUrl: string;
  successUrl?: string;
  backUrl?: string;
  metadata?: Record<string, string>;
};

type MoyasarInvoice = {
  id: string;
  status: string;
  url: string;
};

/** A single payment attempt attached to a Moyasar invoice (invoice.payments[]). */
export type MoyasarInvoicePayment = {
  id: string;
  status: string;
  amount: number;
  /** Card scheme / wallet - e.g. "creditcard", "applepay", "stcpay"; "mada" arrives via source.company. */
  sourceType: string;
  sourceCompany: string;
  /** Gateway's human-readable outcome, e.g. "APPROVED" or a decline reason. */
  message: string;
  createdAt: string;
};

/** The subset of a Moyasar invoice we act on. Never includes raw card data. */
export type MoyasarInvoiceDetails = {
  id: string;
  status: string;
  /** Halalas. */
  amount: number;
  currency: string;
  metadata: Record<string, string>;
  payments: MoyasarInvoicePayment[];
};

/** What we persist onto our own payment row after the gateway settles. */
export type GatewayPaymentDetails = {
  gateway?: string;
  gatewayStatus?: string;
  gatewayPaymentId?: string;
  paymentMethod?: string;
  failureReason?: string;
};

function moyasarSecretKey() {
  return process.env.MOYASAR_SECRET_KEY?.trim() || "";
}

function authorizationHeader(secretKey: string) {
  return `Basic ${Buffer.from(`${secretKey}:`).toString("base64")}`;
}

export function isMoyasarConfigured() {
  return Boolean(moyasarSecretKey());
}

// Moyasar prefixes test-mode keys with "sk_test_" and live keys with
// "sk_live_". Whether a checkout actually charges real money depends on
// this, not just on whether a key is present - a test key is "configured"
// but still simulates every payment against Moyasar's sandbox.
export function isMoyasarLiveMode() {
  return moyasarSecretKey().startsWith("sk_live_");
}

type PaymentMetadataInput = {
  kind: PaymentKind;
  tenantId: string;
  paymentId: string;
  /**
   * "owner" (tenant owner, self-serve), "member" (another tenant employee,
   * e.g. a campaign top-up), "admin" (platform team created the invoice),
   * "system".
   */
  initiatedBy: "owner" | "member" | "admin" | "system";
  companyName?: string;
  planId?: string;
  planName?: string;
  messages?: number;
  gateway?: string;
};

function metadataValue(value: string | number | undefined, maxLength = 120) {
  if (value === undefined || value === null) return "";
  return String(value).trim().slice(0, maxLength);
}

/**
 * Builds the metadata attached to EVERY payment request Linkly creates, on
 * any gateway. The platform name is always present so a payment seen in the
 * Moyasar/Stripe dashboard - or in a bank statement dispute - can be traced
 * back to this product, the tenant, and the exact payment row that staged it.
 * All values are strings (gateway requirement) and bounded in length.
 */
export function buildPaymentMetadata(input: PaymentMetadataInput): Record<string, string> {
  const metadata: Record<string, string> = {
    platform: PAYMENT_PLATFORM_NAME,
    platform_domain: PAYMENT_PLATFORM_DOMAIN,
    product: input.kind === "subscription" ? `${PAYMENT_PLATFORM_NAME} Subscription` : `${PAYMENT_PLATFORM_NAME} Campaign Messages`,
    payment_kind: input.kind,
    payment_id: metadataValue(input.paymentId),
    tenant_id: metadataValue(input.tenantId),
    initiated_by: input.initiatedBy,
    environment: process.env.NODE_ENV === "production" ? "production" : "development"
  };
  if (input.companyName) metadata.company_name = metadataValue(input.companyName, 80);
  if (input.planId) metadata.plan_id = metadataValue(input.planId);
  if (input.planName) metadata.plan_name = metadataValue(input.planName, 80);
  if (input.messages !== undefined) metadata.messages = metadataValue(input.messages);
  if (input.gateway) metadata.gateway = metadataValue(input.gateway);
  return metadata;
}

/** Description shown on the hosted payment page and in the gateway dashboard - always branded. */
export function paymentDescription(kind: PaymentKind, details: { companyName?: string; planName?: string; messages?: number }) {
  if (kind === "subscription") {
    const plan = details.planName ? ` (${details.planName})` : "";
    const company = details.companyName ? ` - ${details.companyName}` : "";
    return `اشتراك ${PAYMENT_PLATFORM_NAME}${company}${plan}`;
  }
  const count = (details.messages ?? 0).toLocaleString("en-US");
  return `شحن ${count} رسالة حملات - ${PAYMENT_PLATFORM_NAME}`;
}

export async function createMoyasarInvoice(input: CreateInvoiceInput): Promise<MoyasarInvoice> {
  const secretKey = moyasarSecretKey();
  if (!secretKey) throw new Error("MOYASAR_NOT_CONFIGURED");

  const response = await fetch("https://api.moyasar.com/v1/invoices", {
    method: "POST",
    headers: {
      Authorization: authorizationHeader(secretKey),
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      amount: input.amountHalalas ?? Math.round(input.amount * 100), // Moyasar amounts are in halalas
      currency: "SAR",
      description: input.description,
      callback_url: input.callbackUrl,
      success_url: input.successUrl,
      back_url: input.backUrl,
      // The platform name is non-negotiable on every request, even if a
      // caller builds metadata by hand and forgets it.
      metadata: { platform: PAYMENT_PLATFORM_NAME, ...(input.metadata || {}) }
    })
  });

  const payload = await response.json().catch(() => null) as {
    id?: string;
    status?: string;
    url?: string;
    message?: string;
    errors?: Record<string, string[]>;
  } | null;

  if (!response.ok || !payload?.id || !payload.url) {
    console.error("Moyasar invoice creation failed", payload);
    throw new Error(payload?.message || "MOYASAR_INVOICE_FAILED");
  }

  return { id: payload.id, status: payload.status || "initiated", url: payload.url };
}

type RawMoyasarPayment = {
  id?: string;
  status?: string;
  amount?: number;
  created_at?: string;
  source?: { type?: string; company?: string; message?: string | null };
};

function normalizeInvoicePayment(raw: RawMoyasarPayment): MoyasarInvoicePayment | null {
  if (!raw?.id) return null;
  return {
    id: raw.id,
    status: raw.status || "",
    amount: Number(raw.amount) || 0,
    sourceType: raw.source?.type || "",
    sourceCompany: raw.source?.company || "",
    message: raw.source?.message || "",
    createdAt: raw.created_at || ""
  };
}

/**
 * Fetches an invoice's current status directly from Moyasar rather than
 * trusting whatever a webhook payload claims. Moyasar delivers invoice
 * status changes to callback_url with no secret_token at all (that's only
 * present on the separate, dashboard-configured account-level "Payments
 * Webhooks"), so a webhook body's own `status` field is not something we
 * can authenticate - only a call we make ourselves, with our own secret
 * key, can be trusted. Returns the amount and the attached payment
 * attempts too, so callers can verify the paid amount and record how the
 * customer paid.
 */
export async function fetchMoyasarInvoice(id: string): Promise<MoyasarInvoiceDetails | null> {
  const secretKey = moyasarSecretKey();
  if (!secretKey || !id) return null;

  const response = await fetch(`https://api.moyasar.com/v1/invoices/${encodeURIComponent(id)}`, {
    headers: { Authorization: authorizationHeader(secretKey) }
  });
  if (!response.ok) return null;

  const payload = await response.json().catch(() => null) as {
    id?: string;
    status?: string;
    amount?: number;
    currency?: string;
    metadata?: Record<string, unknown> | null;
    payments?: RawMoyasarPayment[];
  } | null;
  if (!payload?.id || !payload.status) return null;

  const metadata: Record<string, string> = {};
  for (const [key, value] of Object.entries(payload.metadata || {})) {
    if (value !== null && value !== undefined) metadata[key] = String(value);
  }

  return {
    id: payload.id,
    status: payload.status,
    amount: Number(payload.amount) || 0,
    currency: payload.currency || "SAR",
    metadata,
    payments: (payload.payments || []).map(normalizeInvoicePayment).filter((payment): payment is MoyasarInvoicePayment => payment !== null)
  };
}

/**
 * Picks the payment attempt that decided the invoice's fate (the paid one
 * if any, otherwise the most recent) and flattens it into the columns we
 * store on our own payment row.
 */
export function summarizeMoyasarInvoice(invoice: MoyasarInvoiceDetails): GatewayPaymentDetails {
  const decisive = invoice.payments.find((payment) => payment.status === "paid")
    ?? [...invoice.payments].sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""))[0];
  const failureReason = invoice.status === "paid" ? "" : (decisive?.message || "");
  return {
    gateway: "moyasar",
    gatewayStatus: invoice.status,
    gatewayPaymentId: decisive?.id || "",
    paymentMethod: decisive ? [decisive.sourceType, decisive.sourceCompany].filter(Boolean).join("/") : "",
    failureReason
  };
}

/**
 * Verifies a webhook request came from Moyasar using the shared secret
 * configured on both sides (Moyasar dashboard + MOYASAR_WEBHOOK_SECRET).
 * Moyasar signs webhooks with an HMAC-SHA256 in the `secret_token` field
 * of the payload rather than a header, so this is a direct comparison.
 */
export function verifyMoyasarWebhookSecret(receivedSecret: string | null | undefined) {
  const expected = process.env.MOYASAR_WEBHOOK_SECRET?.trim();
  if (!expected || !receivedSecret) return false;

  const expectedBuffer = Buffer.from(expected);
  const receivedBuffer = Buffer.from(receivedSecret);
  return expectedBuffer.length === receivedBuffer.length && timingSafeEqual(expectedBuffer, receivedBuffer);
}
