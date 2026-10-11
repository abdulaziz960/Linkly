import { NextRequest, NextResponse } from "next/server";
import { unsubscribeEmailRecipient } from "../../../../../lib/email-promotions";

export const runtime = "nodejs";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const email = await unsubscribeEmailRecipient(id).catch(() => null);
  return new NextResponse(`<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8"><title>إلغاء الاشتراك</title><body style="font-family:Arial,Tahoma,sans-serif;display:grid;place-items:center;min-height:80vh;background:#f8fafc;color:#172b2a"><main style="max-width:520px;background:white;border:1px solid #dbe7e4;border-radius:16px;padding:32px;text-align:center"><h1>تم إلغاء الاشتراك</h1><p>${email ? `لن تصلك رسائل تسويقية على ${email}.` : "تم تسجيل طلبك."}</p></main></body></html>`, {
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" }
  });
}
