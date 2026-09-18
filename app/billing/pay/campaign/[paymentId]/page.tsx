import { redirect } from "next/navigation";
import Image from "next/image";
import { getCurrentUser } from "../../../../../lib/auth";
import { userHasViewPermission } from "../../../../../lib/permissions-server";
import { prisma } from "../../../../../lib/prisma";
import { expectedHalalas } from "../../../../../lib/subscriptions";
import { paymentDescription } from "../../../../../lib/moyasar";
import { PAYMENT_STATUS } from "../../../../../lib/payment-status";
import MoyasarPayForm from "../../[paymentId]/MoyasarPayForm";
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

  const publishableKey = process.env.NEXT_PUBLIC_MOYASAR_PUBLISHABLE_KEY || "";
  const description = paymentDescription("campaign_topup", { messages: payment.messages });

  return (
    <main className="test-checkout">
      <section>
        <Image src="/assets/linkly-logo.png" alt="" width={88} height={49} />
        <h1>إتمام الدفع</h1>
        <p>{description} — {payment.amount.toLocaleString("en-US")} ر.س</p>
        {publishableKey ? (
          <MoyasarPayForm
            paymentId={payment.id}
            amountHalalas={expectedHalalas(payment)}
            description={description}
            publishableKey={publishableKey}
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
