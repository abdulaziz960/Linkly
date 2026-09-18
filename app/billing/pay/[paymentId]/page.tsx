import { redirect } from "next/navigation";
import Image from "next/image";
import { getCurrentUser } from "../../../../lib/auth";
import { prisma } from "../../../../lib/prisma";
import { expectedHalalas } from "../../../../lib/subscriptions";
import { PAYMENT_STATUS } from "../../../../lib/payment-status";
import MoyasarPayForm from "./MoyasarPayForm";
import "../../billing.css";

export const metadata = { title: { absolute: "إتمام الدفع | Linkly" } };

/**
 * Our own branded checkout - Moyasar.js embeds only the card-number/CVC
 * fields themselves (via the publishable key, see MoyasarPayForm), the rest
 * of the page (logo, copy, layout) is ours. Reached from /billing after
 * POST /api/billing/checkout stages a pending SubscriptionPayment row.
 */
export default async function BillingPayPage({ params }: { params: Promise<{ paymentId: string }> }) {
  const user = await getCurrentUser({ allowExpired: true });
  if (!user) redirect("/login?next=/billing");
  if (user.role !== "مالك الحساب") redirect("/billing");

  const { paymentId } = await params;
  const payment = await prisma.subscriptionPayment.findFirst({ where: { id: paymentId, tenantId: user.tenantId } });
  if (!payment) redirect("/billing");
  if (payment.status === PAYMENT_STATUS.completed) redirect("/billing/success");
  if (payment.status !== PAYMENT_STATUS.pending) redirect("/billing");

  const publishableKey = process.env.NEXT_PUBLIC_MOYASAR_PUBLISHABLE_KEY || "";
  const description = `اشتراك Linkly${payment.planName ? ` (${payment.planName})` : ""}`;

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
          />
        ) : (
          <p className="billing-error" role="alert">بوابة الدفع غير مهيأة حاليًا. تواصل مع الدعم الفني.</p>
        )}
      </section>
    </main>
  );
}
