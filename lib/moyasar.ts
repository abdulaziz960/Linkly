/**
 * Moyasar hosted-invoice integration. We never touch card details
 * ourselves - Moyasar hosts the payment page and calls our webhook when
 * the invoice's status changes. Nothing here runs until MOYASAR_SECRET_KEY
 * is set in the environment; until then createMoyasarInvoice throws a
 * clear "not configured" error the API route turns into a friendly message.
 */

type CreateInvoiceInput = {
  amount: number; // SAR
  description: string;
  callbackUrl: string;
  metadata?: Record<string, string>;
};

type MoyasarInvoice = {
  id: string;
  status: string;
  url: string;
};

function moyasarSecretKey() {
  return process.env.MOYASAR_SECRET_KEY?.trim() || "";
}

export function isMoyasarConfigured() {
  return Boolean(moyasarSecretKey());
}

export async function createMoyasarInvoice(input: CreateInvoiceInput): Promise<MoyasarInvoice> {
  const secretKey = moyasarSecretKey();
  if (!secretKey) throw new Error("MOYASAR_NOT_CONFIGURED");

  const response = await fetch("https://api.moyasar.com/v1/invoices", {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${secretKey}:`).toString("base64")}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      amount: Math.round(input.amount * 100), // Moyasar amounts are in halalas
      currency: "SAR",
      description: input.description,
      callback_url: input.callbackUrl,
      metadata: input.metadata || {}
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

/**
 * Verifies a webhook request came from Moyasar using the shared secret
 * configured on both sides (Moyasar dashboard + MOYASAR_WEBHOOK_SECRET).
 * Moyasar signs webhooks with an HMAC-SHA256 in the `secret_token` field
 * of the payload rather than a header, so this is a direct comparison.
 */
export function verifyMoyasarWebhookSecret(receivedSecret: string | null | undefined) {
  const expected = process.env.MOYASAR_WEBHOOK_SECRET?.trim();
  if (!expected) return false;
  return Boolean(receivedSecret) && receivedSecret === expected;
}
