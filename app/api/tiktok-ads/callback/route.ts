import { NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * Where TikTok sends an advertiser back after they authorize Linkly (TikTok API for Business).
 * For now it only confirms receipt: the code is not exchanged and nothing from the query is stored or echoed.
 * The real connection (token exchange, saving the advertiser account) replaces this once the app is approved.
 */
export async function GET() {
  const html = `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Linkly - ربط تيك توك</title></head><body style="font-family:system-ui,sans-serif;display:grid;place-items:center;min-height:100vh;margin:0;background:#f6f8f8;color:#0b2b2b"><main style="text-align:center;padding:24px"><h1 style="font-size:22px">تم استلام طلب الربط</h1><p>سيتوفر ربط حساب TikTok Ads مع Linkly قريبًا.</p><p dir="ltr" style="color:#64748b">Your TikTok Ads connection request was received. The integration is coming soon.</p><p><a href="/dashboard?view=integrations">العودة إلى لوحة التحكم / Back to dashboard</a></p></main></body></html>`;
  return new NextResponse(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
}
