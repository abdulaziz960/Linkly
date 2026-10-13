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
