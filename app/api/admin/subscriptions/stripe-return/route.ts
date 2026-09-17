import { NextRequest, NextResponse } from "next/server";
import { ensureSchema } from "../../../../../lib/database";
import { prisma } from "../../../../../lib/prisma";
import { retrieveStripeCheckoutSession } from "../../../../../lib/stripe";
import { applyConfirmedSubscriptionPayment, expectedHalalas, logAdminAction } from "../../../../../lib/subscriptions";
import { getPaymentCallbackOrigin } from "../../../../../lib/app-url";

export const runtime = "nodejs";

const baseUrl = getPaymentCallbackOrigin;

/**
 * Stripe redirects the admin back here after checkout. Rather than trust
 * the redirect itself, we look the session up from Stripe by id (using our
 * secret key) and only mark the payment complete if Stripe confirms it was
 * actually paid - this avoids needing a webhook signing secret for what is
 * a test-mode-only gateway.
 */
export async function GET(request: NextRequest) {
  const sessionId = request.nextUrl.searchParams.get("session_id");
  const paymentId = request.nextUrl.searchParams.get("paymentId");

  if (!sessionId || !paymentId) {
    return NextResponse.redirect(`${baseUrl()}/linkly-admin007/payments`);
  }

  await ensureSchema();
  const payment = await prisma.subscriptionPayment.findUnique({ where: { id: paymentId } });

  // The session must be the one created for THIS payment row (charge route
  // stores it as stripe_test_<session id>); otherwise any paid session could
  // be replayed against a different, larger payment.
  if (payment && payment.status !== "مكتمل" && payment.moyasarId === `stripe_test_${sessionId}`) {
    try {
      const session = await retrieveStripeCheckoutSession(sessionId);
      if (session.paymentStatus === "paid" && session.amountTotal !== expectedHalalas(payment)) {
        console.error(`Stripe return amount mismatch for ${payment.id}: session=${session.amountTotal} expected=${expectedHalalas(payment)}`);
      } else if (session.paymentStatus === "paid") {
        const subscription = await prisma.subscription.findUnique({ where: { tenantId: payment.tenantId } });
        const { activated } = await applyConfirmedSubscriptionPayment(payment.id, {
          gateway: "stripe",
          gatewayStatus: session.paymentStatus,
          gatewayPaymentId: session.id,
          paymentMethod: "card"
        });

        if (activated && subscription) {
          await logAdminAction(
            payment.tenantId,
            subscription.companyName,
            `تم استلام دفعة اشتراك تجريبية بقيمة ${payment.amount} ر.س عبر Stripe (وضع اختبار)، وتم تجديد الاشتراك.`
          );
        }
      }
    } catch (error) {
      console.error("Stripe return verification failed", error);
    }
  }

  return NextResponse.redirect(`${baseUrl()}/linkly-admin007/payments`);
}
