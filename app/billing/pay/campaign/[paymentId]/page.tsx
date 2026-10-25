import { formatNumber } from "../../../../../lib/format";
import { redirect } from "next/navigation";
import Image from "next/image";
import { getCurrentUser } from "../../../../../lib/auth";
import { userHasViewPermission } from "../../../../../lib/permissions-server";
import { prisma } from "../../../../../lib/prisma";
import { expectedHalalas } from "../../../../../lib/subscriptions";
import { paymentDescription, paymentStatementDescriptor } from "../../../../../lib/moyasar";
import { getMoyasarPublishableKey } from "../../../../../lib/moyasar-publishable";
import { PAYMENT_STATUS } from "../../../../../lib/payment-status";
import MoyasarPayForm from "../../[paymentId]/MoyasarPayForm";
import PayPromoBox from "../../PayPromoBox";
import PayTaxSummary from "../../PayTaxSummary";
import TaxProfileCard from "../../../TaxProfileCard";
import { getTaxProfile } from "../../../../../lib/tax-profile";
import { getPaymentPromoSummary } from "../../../../../lib/promo-codes";
import "../../../billing.css";

export const metadata = { title: { absolute: "إتمام الدفع | Linkly" } };

/**
 * Campaign-topup counterpart of /billing/pay/[paymentId]: same branded
 * embedded checkout, reused MoyasarPayForm (kind="campaign_topup" routes it
 * to /api/campaigns/balance/confirm-payment instead). Reached from the
 * Campaigns view after POST /api/campaigns/balance/charge stages a pending
 * CampaignPayment row.
 */
export default async function CampaignPayPage({ params }: { params: Promise<{ paymentId: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/dashboard?view=campaigns");
  if (!(await userHasViewPermission(user, "campaigns"))) redirect("/dashboard");

  const { paymentId } = await params;
  const payment = await prisma.campaignPayment.findFirst({ where: { id: paymentId, tenantId: user.tenantId } });
  if (!payment) redirect("/dashboard?view=campaigns&tab=balance");
  if (payment.status === PAYMENT_STATUS.completed) redirect("/billing/success?kind=campaign_topup");
  if (payment.status !== PAYMENT_STATUS.pending) redirect("/dashboard?view=campaigns&tab=balance");

  const publishableKey = getMoyasarPublishableKey();
  const description = paymentDescription("campaign_topup", { messages: payment.messages });
  const promo = await getPaymentPromoSummary(payment.id);

  return (
    <main className="test-checkout">
      <section>
        <Image src="/assets/linkly-logo.png" alt="" width={88} height={49} />
        <h1>إتمام الدفع</h1>
        <p>{description} — {formatNumber(payment.amount)} ر.س <small>(قبل الضريبة)</small></p>
        <PayTaxSummary payment={payment} />
        <TaxProfileCard initial={await getTaxProfile(user.tenantId)} />
        <PayPromoBox
          endpoint="/api/campaigns/balance/promo"
          paymentId={payment.id}
          appliedCode={promo?.code ?? ""}
          subtotal={promo?.originalAmount ?? payment.amount}
          discountAmount={promo?.discountAmount ?? 0}
          total={payment.amount}
        />
        {publishableKey ? (
          <MoyasarPayForm
            key={payment.amountHalalas}
            paymentId={payment.id}
            amountHalalas={expectedHalalas(payment)}
            description={description}
            publishableKey={publishableKey}
            statementDescriptor={paymentStatementDescriptor()}
            kind="campaign_topup"
            confirmUrl="/api/campaigns/balance/confirm-payment"
          />
        ) : (
          <p className="billing-error" role="alert">بوابة الدفع غير مهيأة حاليًا. تواصل مع الدعم الفني.</p>
        )}
      </section>
    </main>
  );
}
