import { formatNumber } from "../../../../../lib/format";
import { redirect } from "next/navigation";
import Image from "next/image";
import { getCurrentUser } from "../../../../../lib/auth";
import { userHasViewPermission } from "../../../../../lib/permissions-server";
import { prisma } from "../../../../../lib/prisma";
import { expectedHalalas } from "../../../../../lib/subscriptions";
import { paymentStatementDescriptor } from "../../../../../lib/moyasar";
import { getMoyasarPublishableKey } from "../../../../../lib/moyasar-publishable";
import { PAYMENT_STATUS } from "../../../../../lib/payment-status";
import PayTaxSummary from "../../PayTaxSummary";
import TaxProfileCard from "../../../TaxProfileCard";
import { getTaxProfile } from "../../../../../lib/tax-profile";
import MoyasarPayForm from "../../[paymentId]/MoyasarPayForm";
import "../../../billing.css";

export const metadata = { title: { absolute: "شراء رصيد البريد | Linkly" } };

export default async function EmailTopupPayPage({ params }: { params: Promise<{ paymentId: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/dashboard?view=emailPromotions");
  if (!(await userHasViewPermission(user, "emailPromotions"))) redirect("/dashboard");

  const { paymentId } = await params;
  const payment = await prisma.campaignPayment.findFirst({ where: { id: paymentId, tenantId: user.tenantId } });
  if (!payment || !payment.id.startsWith("pay-email-")) redirect("/dashboard?view=emailPromotions&tab=balance");
  if (payment.status === PAYMENT_STATUS.completed) redirect("/billing/success?kind=email_topup");
  if (payment.status !== PAYMENT_STATUS.pending) redirect("/dashboard?view=emailPromotions&tab=balance");

  const publishableKey = getMoyasarPublishableKey();
  const description = `شراء ${formatNumber(payment.messages)} رصيد بريد تسويقي - Linkly`;

  return (
    <main className="test-checkout">
      <section>
        <Image src="/assets/linkly-logo.png" alt="" width={88} height={49} />
        <h1>شراء رصيد البريد</h1>
        <p>{description} — {formatNumber(payment.amount)} ر.س <small>(قبل الضريبة)</small></p>
        <PayTaxSummary payment={payment} />
        <TaxProfileCard initial={await getTaxProfile(user.tenantId)} />
        {publishableKey ? (
          <MoyasarPayForm
            key={payment.amountHalalas}
            paymentId={payment.id}
            amountHalalas={expectedHalalas(payment)}
            description={description}
            publishableKey={publishableKey}
            statementDescriptor={paymentStatementDescriptor()}
            kind="email_topup"
            confirmUrl="/api/email-promotions/balance/confirm-payment"
          />
        ) : (
          <p className="billing-error" role="alert">بوابة الدفع غير مهيأة حاليًا. تواصل مع الدعم الفني.</p>
        )}
      </section>
    </main>
  );
}
