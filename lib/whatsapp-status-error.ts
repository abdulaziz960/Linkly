/**
 * The text stored for a "failed" delivery status. Meta's error code comes first ("(#131042) ..."): the code is what
 * tells the reasons apart in reports, and the title alone is often too vague to act on.
 */
export function whatsappStatusErrorText(errors: unknown): string {
  const first = (Array.isArray(errors) ? errors[0] : undefined) as { code?: unknown; title?: unknown; message?: unknown; error_data?: { details?: unknown } } | undefined;
  if (!first) return "";
  const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");
  const title = text(first.title) || text(first.message);
  const details = text(first.error_data?.details);
  const code = Number.isInteger(Number(first.code)) && Number(first.code) > 0 ? `(#${Number(first.code)})` : "";
  return [code, title, details && details !== title ? `- ${details}` : ""].filter(Boolean).join(" ").slice(0, 400);
}
