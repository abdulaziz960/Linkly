import { NextRequest } from "next/server";
import { isTrustedOrigin } from "../../../../../lib/origin-guard";
import { consumeRateLimit, requestIdentifier } from "../../../../../lib/rate-limit";
import { answerQuote } from "../../../../../lib/quotes/store";
import type { ClientAnswer } from "../../../../../lib/quotes/model";
import { jsonError, jsonOk } from "../../../_utils/json";

export const runtime = "nodejs";

const ANSWERS: ClientAnswer[] = ["approve", "request_changes", "decline"];

/** The client's answer from the link in their email. The link is the only thing that proves who they are, so it is rate limited and works once. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  if (!isTrustedOrigin(request)) return jsonError("الطلب مرفوض (مصدر غير موثوق)", 403);
  const limit = await consumeRateLimit("quote-answer", requestIdentifier(request, "public"), 20, 10 * 60_000);
  if (!limit.allowed) return jsonError("محاولات كثيرة. حاول مرة أخرى بعد قليل", 429);
  const body = (await request.json().catch(() => null)) as { answer?: unknown; note?: unknown } | null;
  const answer = ANSWERS.find((value) => value === body?.answer);
  if (!answer) return jsonError("إجابة غير صالحة", 400);
  const note = typeof body?.note === "string" ? body.note.trim().slice(0, 1000) : "";
  if (answer === "request_changes" && note.length < 3) return jsonError("اكتب التعديل المطلوب", 400);
  const result = await answerQuote((await params).token, answer, note);
  if (!result.ok) return jsonError(result.error, result.status);
  return jsonOk({ status: result.quote.status });
}
