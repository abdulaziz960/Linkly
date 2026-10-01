import { prisma } from "./prisma";

// Meta's error code for "There was an error related to your payment
// method" - covers a missing/declined payment method or an exceeded credit
// line on the WhatsApp Business Account. Meta doesn't expose the actual
// amount owed to a tech-provider app like ours via the Graph API (that
// figure only shows inside the business's own Meta Business Suite), so we
// can only detect and surface THAT there's a payment problem, not how much.
const PAYMENT_ISSUE_ERROR_CODE = 131042;

export function whatsappSendErrorCode(payload: unknown): number | undefined {
  const code = (payload as { error?: { code?: number } } | null | undefined)?.error?.code;
  return typeof code === "number" ? code : undefined;
}

/**
 * Called after every WhatsApp send attempt. Only writes to the database
 * when the payment-issue state actually changes, so a healthy account's
 * hot send path never pays for an extra query per message.
 */
export async function recordWhatsAppSendOutcome(params: {
  tenantId: string;
  ok: boolean;
  hadIssueFlag: boolean;
  errorCode?: number;
}) {
  if (!params.ok && params.errorCode === PAYMENT_ISSUE_ERROR_CODE && !params.hadIssueFlag) {
    await prisma.integrationSetting.updateMany({
      where: { tenantId: params.tenantId, provider: "whatsapp_cloud", whatsappPaymentIssueAt: "" },
      data: { whatsappPaymentIssueAt: new Date().toISOString() }
    }).catch(() => {});
    return;
  }
  if (params.ok && params.hadIssueFlag) {
    await prisma.integrationSetting.updateMany({
      where: { tenantId: params.tenantId, provider: "whatsapp_cloud", whatsappPaymentIssueAt: { not: "" } },
      data: { whatsappPaymentIssueAt: "" }
    }).catch(() => {});
  }
}
