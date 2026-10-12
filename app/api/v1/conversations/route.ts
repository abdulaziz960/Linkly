import { NextRequest, NextResponse } from "next/server";
import { authenticateApiRequest, openApiConversation } from "../../../../lib/developer-api";
import { consumeRateLimit } from "../../../../lib/rate-limit";
import { isValidSaudiPhone } from "../../../../lib/validation";
import { withCors } from "../../_utils/cors";
import { extraAnswersFromBody, type FormAnswer } from "../../../../lib/lead-form";
import { saveFormSubmission } from "../../../../lib/lead-form-store";

export const runtime = "nodejs";

export async function OPTIONS() {
  return withCors(new NextResponse(null, { status: 204 }));
}

export async function POST(request: NextRequest) {
  const auth = await authenticateApiRequest(request);
  if (!auth) return withCors(NextResponse.json({ ok: false, error: "Invalid or missing API key" }, { status: 401 }));

  const rateLimit = await consumeRateLimit("public-api", auth.rawKey, 60, 60_000);
  if (!rateLimit.allowed) {
    return withCors(NextResponse.json({ ok: false, error: "Too many requests" }, { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } }));
  }

  // Zapier's "Form" payload type sends form fields instead of JSON; both are accepted.
  const contentType = request.headers.get("content-type") || "";
  const raw = /application\/x-www-form-urlencoded|multipart\/form-data/i.test(contentType)
    ? await request.formData().then((form) => Object.fromEntries([...form.entries()].filter(([, value]) => typeof value === "string"))).catch(() => null) as Record<string, unknown> | null
    : (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const body = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : null;
  const stringOf = (...keys: string[]) => {
    for (const key of keys) {
      const value = body?.[key];
      if (typeof value === "string" && value.trim()) return value.trim();
      if (typeof value === "number") return String(value);
    }
    return "";
  };
  // Form-style names (phone_number, full_name...) are accepted next to the original ones.
  const customerPhone = stringOf("customerPhone", "phone_number", "phone", "mobile");
  const customerName = stringOf("customerName", "full_name", "name").slice(0, 100);
  const answers: FormAnswer[] = body ? extraAnswersFromBody(body) : [];
  const explicitText = stringOf("text").slice(0, 4000);
  // With no text, the answers themselves are the message.
  const text = explicitText || (answers.length ? "عميل محتمل من نموذج خارجي" : "");

  if (!customerPhone || !text) {
    return withCors(NextResponse.json({ ok: false, error: "phone_number (or customerPhone) is required, with either text or form fields" }, { status: 400 }));
  }
  if (!isValidSaudiPhone(customerPhone)) {
    return withCors(NextResponse.json({ ok: false, error: "customerPhone must be a valid Saudi mobile number" }, { status: 400 }));
  }
  const visitAt = stringOf("visitAt");
  if (visitAt && Number.isNaN(Date.parse(visitAt))) {
    return withCors(NextResponse.json({ ok: false, error: "visitAt must be a valid ISO date" }, { status: 400 }));
  }

  try {
    const { conversationId } = await openApiConversation(auth.tenantId, {
      customerPhone,
      customerName: customerName || undefined,
      text,
      recordVisit: body?.visit === true || body?.visit === "true",
      visitAt: visitAt ? new Date(visitAt).toISOString() : undefined
    });
    // Whatever else the form carried (email, budget, purpose...) is kept on the lead and shown in the conversation.
    if (answers.length) {
      const key = `api-${conversationId}-${Date.now()}`;
      await saveFormSubmission({
        tenantId: auth.tenantId,
        conversationId,
        key,
        source: "api",
        title: "بيانات النموذج",
        answers,
        name: customerName,
        phone: customerPhone
      });
    }
    return withCors(NextResponse.json({ ok: true, data: { conversationId } }));
  } catch (error) {
    console.error("Public API conversation creation failed", error);
    return withCors(NextResponse.json({ ok: false, error: "Unable to create the conversation" }, { status: 500 }));
  }
}
