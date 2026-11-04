import { formatNumber } from "../../../../lib/format";
import { redirect } from "next/navigation";
import Image from "next/image";
import { getCurrentUser } from "../../../../lib/auth";
import { prisma } from "../../../../lib/prisma";
import { expectedHalalas } from "../../../../lib/subscriptions";
import { PAYMENT_STATUS } from "../../../../lib/payment-status";
import { isBillingCycle, isSamePlanRenewalTooEarly } from "../../../../lib/billing-pricing";
import { paymentStatementDescriptor } from "../../../../lib/moyasar";
import { getMoyasarPublishableKey } from "../../../../lib/moyasar-publishable";
import MoyasarPayForm from "./MoyasarPayForm";
import PayPromoBox from "../PayPromoBox";
import PayTaxSummary from "../PayTaxSummary";
import TaxProfileCard from "../../TaxProfileCard";
import { getTaxProfile } from "../../../../lib/tax-profile";
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
  const { paymentId } = await params;
  if (!user) redirect(`/login?next=${encodeURIComponent(`/billing/pay/${paymentId}`)}`);
  const notice = (title: string, body: string, extra?: React.ReactNode) => (
    <main className="test-checkout">
      <section>
        <Image src="/assets/linkly-logo.png" alt="" width={88} height={49} />
        <h1>{title}</h1>
        <p>{body}</p>
        {extra}
        <p><a href="/billing">الذهاب إلى صفحة الاشتراك</a></p>
      </section>
    </main>
  );

  const payment = await prisma.subscriptionPayment.findFirst({ where: { id: paymentId, tenantId: user.tenantId } });
  if (!payment) {
    // A platform admin opening the link they generated is signed in to their own
    // workspace, not the client's: show what the client will see instead of
    // silently bouncing to the plans page.
    if (user.isPlatformAdmin === 1) {
      const staged = await prisma.subscriptionPayment.findUnique({ where: { id: paymentId } });
      if (staged) {
        return notice(
          "معاينة رابط الدفع",
          `هذا رابط دفع للعميل بقيمة ${formatNumber(staged.amount)} ر.س (قبل الضريبة). أنت مسجّل بحساب الأدمن، لذلك لا يمكنك الدفع من هنا. أرسل الرابط للعميل ليفتحه بحساب مالك الحساب ويكمل الدفع.`
        );
      }
    }
    return notice("هذا الرابط لا يخص حسابك", "سجّل الدخول بحساب مالك الحساب الذي أُرسل له رابط الدفع، أو تواصل مع الدعم.");
  }
  if (user.role !== "مالك الحساب") return notice("الدفع متاح لمالك الحساب فقط", "اطلب من مالك الحساب فتح هذا الرابط وإكمال الدفع.");
  if (payment.status === PAYMENT_STATUS.completed) redirect("/billing/success");
  if (payment.status !== PAYMENT_STATUS.pending) return notice("انتهت صلاحية رابط الدفع", "هذا الرابط لم يعد صالحًا. اطلب رابطًا جديدًا من الدعم.");
  // A pending row staged before the plan was paid for (or opened from an old
  // link) must not stack a second payment on a plan that is still paid up.
  const subscription = await prisma.subscription.findUnique({ where: { tenantId: user.tenantId } });
  if (isBillingCycle(payment.billingCycle) && isSamePlanRenewalTooEarly(subscription, payment.planName, payment.billingCycle)) redirect("/billing");

  const publishableKey = getMoyasarPublishableKey();
  const description = `اشتراك Linkly${payment.planName ? ` (${payment.planName})` : ""}`;

  return (
    <main className="test-checkout">
      <section>
        <Image src="/assets/linkly-logo.png" alt="" width={88} height={49} />
        <h1>إتمام الدفع</h1>
        {payment.prorationCreditAmount > 0 ? (
          <div className="proration-breakdown">
            <p>{description}</p>
            <dl>
              <div><dt>سعر الباقة</dt><dd>{formatNumber(payment.listPrice)} ر.س</dd></div>
              <div><dt>خصم الأيام المتبقية من باقتك الحالية</dt><dd>-{formatNumber(payment.prorationCreditAmount)} ر.س</dd></div>
              <div className="proration-final"><dt>المبلغ قبل الضريبة</dt><dd>{formatNumber(payment.amount)} ر.س</dd></div>
            </dl>
          </div>
        ) : (
          <p>{description} — {formatNumber(payment.amount)} ر.س <small>(قبل الضريبة)</small></p>
        )}
        <PayTaxSummary payment={payment} />
        <TaxProfileCard initial={await getTaxProfile(user.tenantId)} />
        <PayPromoBox
          endpoint="/api/billing/pay-promo"
          paymentId={payment.id}
          appliedCode={payment.promoCode}
          subtotal={Math.round((payment.amount + payment.discountAmount) * 100) / 100}
          discountAmount={payment.discountAmount}
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
          />
        ) : (
          <p className="billing-error" role="alert">بوابة الدفع غير مهيأة حاليًا. تواصل مع الدعم الفني.</p>
        )}
      </section>
    </main>
  );
}
