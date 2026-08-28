import { NextRequest, NextResponse } from "next/server";
import { ensureSchema } from "../../../../../lib/database";
import { prisma } from "../../../../../lib/prisma";
import { retrieveStripeCheckoutSession } from "../../../../../lib/stripe";
import { applyConfirmedSubscriptionPayment, logAdminAction } from "../../../../../lib/subscriptions";

export const runtime = "nodejs";

function baseUrl() {
  return process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || "http://localhost:3000";
}

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

  if (payment && payment.status !== "مكتمل") {
    try {
      const session = await retrieveStripeCheckoutSession(sessionId);
      if (session.paymentStatus === "paid") {
        const subscription = await prisma.subscription.findUnique({ where: { tenantId: payment.tenantId } });
        const { activated } = await applyConfirmedSubscriptionPayment(payment.id);

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
