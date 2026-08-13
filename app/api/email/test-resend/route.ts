import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const { apiKey } = await request.json();
  if (typeof apiKey !== "string" || !apiKey.trim().startsWith("re_")) {
    return NextResponse.json({ error: "مفتاح Resend يجب أن يبدأ بـ re_." }, { status: 400 });
  }
  const response = await fetch("https://api.resend.com/domains", { headers: { Authorization: `Bearer ${apiKey.trim()}` } });
  if (!response.ok) return NextResponse.json({ error: "تعذر التحقق من المفتاح. تأكد من صحته ثم حاول مجددًا." }, { status: 400 });
  return NextResponse.json({ ok: true, message: "مفتاح Resend صالح. أضفه في Vercel باسم RESEND_API_KEY للإرسال الفعلي." });
}
