/**
 * Serialises structured data for a <script type="application/ld+json"> tag.
 *
 * JSON.stringify leaves "<" untouched, so a value such as "</script><script>..."
 * (an FAQ answer or a blog title edited in the admin panel) would close the
 * tag and run as page script. Escaping the characters an HTML parser or a
 * JS engine could treat specially keeps the output valid JSON that parses to
 * exactly the same data.
 */
export function safeJsonLd(data: unknown): string {
  return (JSON.stringify(data) ?? "null")
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

export const CUSTOM_JSON_LD_MAX = 20000;

const isNode = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const hasSchemaContext = (node: Record<string, unknown>) => {
  const context = node["@context"];
  return (typeof context === "string" && /^https?:\/\/schema\.org\/?$/i.test(context.trim())) || (isNode(context) && typeof context["@vocab"] === "string" && /schema\.org/i.test(context["@vocab"]));
};

/**
 * Structured data an admin pastes for a page. It must be JSON, one node (or a list of nodes) of schema.org with an "@type" (or an "@graph"),
 * and not too long. The stored text is the same data, pretty-printed; the page prints it through safeJsonLd, so it can never close the script tag.
 */
export function cleanCustomJsonLd(value: unknown): { ok: true; text: string } | { ok: false; error: string } {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw) return { ok: true, text: "" };
  if (raw.length > CUSTOM_JSON_LD_MAX) return { ok: false, error: "بيانات JSON-LD طويلة (الحد 20,000 حرف)" };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, error: "صيغة JSON غير صحيحة. تأكد من الأقواس والفواصل وعلامات التنصيص." };
  }
  const nodes = Array.isArray(parsed) ? parsed : [parsed];
  if (!nodes.length || nodes.length > 20 || !nodes.every(isNode)) return { ok: false, error: "اكتب كائن JSON واحدًا، أو قائمة من الكائنات (حتى 20)." };
  for (const node of nodes as Array<Record<string, unknown>>) {
    if (!hasSchemaContext(node)) return { ok: false, error: 'كل كائن يحتاج "@context": "https://schema.org"' };
    if (!node["@type"] && !Array.isArray(node["@graph"])) return { ok: false, error: 'كل كائن يحتاج "@type" (مثل Organization أو FAQPage) أو "@graph"' };
  }
  return { ok: true, text: JSON.stringify(parsed, null, 2) };
}
