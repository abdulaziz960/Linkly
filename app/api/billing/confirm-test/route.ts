import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "../../../../lib/auth";
import { ensureSchema } from "../../../../lib/database";
import { prisma } from "../../../../lib/prisma";
import { applyConfirmedSubscriptionPayment } from "../../../../lib/subscriptions";
export async function POST(request: NextRequest) {
  if (process.env.NODE_ENV === "production" || process.env.MOYASAR_LIVE_MODE === "true" || process.env.MOYASAR_SECRET_KEY) return NextResponse.json({ error: "المحاكاة غير متاحة في وضع الدفع الحقيقي" }, { status: 403 });
  const user=await getCurrentUser({ allowExpired: true }); if(!user)return NextResponse.json({error:"سجّل الدخول أولًا"},{status:401});
  const {paymentId}=await request.json().catch(()=>({paymentId:""})) as {paymentId?:string}; await ensureSchema();
  const payment=await prisma.subscriptionPayment.findFirst({where:{id:paymentId,tenantId:user.tenantId}}); if(!payment||!payment.moyasarId.startsWith("test_"))return NextResponse.json({error:"عملية الدفع غير موجودة"},{status:404});
  await applyConfirmedSubscriptionPayment(payment.id);
  return NextResponse.json({ok:true});
}
