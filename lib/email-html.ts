/**
 * Allow-list sanitiser for the HTML of marketing emails.
 *
 * The campaign editor stores whatever the author typed or pasted, and that
 * markup is later shown inside the dashboard and sent to customers. Anything
 * that is not on the lists below is dropped, so an employee cannot smuggle a
 * script, an event handler or a javascript: link into the owner's session or a
 * customer's mailbox. The output is rebuilt from the allowed pieces rather than
 * "cleaned", so malformed input cannot slip a tag through.
 */

const ALLOWED_TAGS = new Set([
  "p", "br", "div", "span", "b", "strong", "i", "em", "u", "s", "strike", "ul", "ol", "li", "a",
  "h1", "h2", "h3", "h4", "blockquote", "hr", "img", "table", "thead", "tbody", "tr", "td", "th", "font"
]);

// Elements whose whole content is dropped, not just the tag. (Void elements such as
// embed or frame have no content, so dropping the tag alone is enough for them.)
const DROP_WITH_CONTENT = new Set([
  "script", "style", "iframe", "object", "noscript", "template", "svg", "math", "head", "title",
  "textarea", "select", "applet", "frameset", "canvas", "video", "audio"
]);

const VOID_TAGS = new Set(["br", "hr", "img"]);

const GLOBAL_ATTRIBUTES = new Set(["dir", "align", "title", "style"]);
const TAG_ATTRIBUTES: Record<string, string[]> = {
  a: ["href"],
  img: ["src", "alt", "width", "height"],
  td: ["colspan", "rowspan"],
  th: ["colspan", "rowspan"],
  font: ["color", "size"]
};

const ALLOWED_STYLE_PROPERTIES = new Set([
  "color", "background-color", "font-size", "font-weight", "font-style", "text-align", "text-decoration", "line-height", "direction"
]);

const TAG_PATTERN = /<(\/?)([a-zA-Z][a-zA-Z0-9:-]*)((?:"[^"]*"|'[^']*'|[^'">])*)>/g;
const ATTRIBUTE_PATTERN = /([^\s"'<>\/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;

function escapeText(value: string) {
  return value.replace(/</g, "&lt;");
}

function escapeAttribute(value: string) {
  return value.replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// The value must literally start with an allowed scheme: an entity-encoded or
// otherwise obfuscated "javascript:" never matches and is dropped.
function safeUrl(value: string, schemes: RegExp) {
  const trimmed = value.trim();
  return schemes.test(trimmed) ? trimmed : "";
}

function safeStyle(value: string) {
  const kept: string[] = [];
  for (const declaration of value.split(";")) {
    const separator = declaration.indexOf(":");
    if (separator < 1) continue;
    const property = declaration.slice(0, separator).trim().toLowerCase();
    const propertyValue = declaration.slice(separator + 1).trim();
    if (!ALLOWED_STYLE_PROPERTIES.has(property)) continue;
    if (!/^[#a-zA-Z0-9\s.,%()-]+$/.test(propertyValue)) continue;
    if (/url\s*\(|expression|javascript|import/i.test(propertyValue)) continue;
    kept.push(`${property}: ${propertyValue}`);
  }
  return kept.join("; ");
}

function rebuildAttributes(tag: string, raw: string) {
  const allowedForTag = new Set(TAG_ATTRIBUTES[tag] || []);
  const out: string[] = [];
  const seen = new Set<string>();
  for (const match of raw.matchAll(ATTRIBUTE_PATTERN)) {
    const name = match[1].toLowerCase();
    if (seen.has(name) || !(GLOBAL_ATTRIBUTES.has(name) || allowedForTag.has(name))) continue;
    const value = match[2] ?? match[3] ?? match[4] ?? "";
    let cleaned = "";
    if (name === "href") cleaned = safeUrl(value, /^(https?:\/\/|mailto:|tel:)/i);
    else if (name === "src") cleaned = safeUrl(value, /^https:\/\//i);
    else if (name === "style") cleaned = safeStyle(value);
    else if (name === "dir") cleaned = /^(ltr|rtl|auto)$/i.test(value.trim()) ? value.trim().toLowerCase() : "";
    else if (name === "align") cleaned = /^(left|right|center|justify)$/i.test(value.trim()) ? value.trim().toLowerCase() : "";
    else if (name === "width" || name === "height" || name === "colspan" || name === "rowspan" || name === "size") cleaned = /^[0-9]{1,4}%?$/.test(value.trim()) ? value.trim() : "";
    else if (name === "color") cleaned = /^(#[0-9a-fA-F]{3,8}|[a-zA-Z]{3,20})$/.test(value.trim()) ? value.trim() : "";
    else cleaned = value.slice(0, 300);
    if (!cleaned) continue;
    seen.add(name);
    out.push(`${name}="${escapeAttribute(cleaned)}"`);
  }
  if (tag === "a" && seen.has("href")) out.push('target="_blank"', 'rel="noopener noreferrer"');
  return out.length ? ` ${out.join(" ")}` : "";
}

export function sanitizeEmailHtml(input: string): string {
  const source = String(input ?? "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, "")
    .replace(/<[?!][^>]*>/g, "");

  let output = "";
  let cursor = 0;
  TAG_PATTERN.lastIndex = 0;
  for (let match = TAG_PATTERN.exec(source); match; match = TAG_PATTERN.exec(source)) {
    output += escapeText(source.slice(cursor, match.index));
    cursor = match.index + match[0].length;
    const closing = match[1] === "/";
    const tag = match[2].toLowerCase();

    if (DROP_WITH_CONTENT.has(tag)) {
      if (closing) continue;
      const closeStart = source.toLowerCase().indexOf("</" + tag, cursor);
      const closeEnd = closeStart === -1 ? -1 : source.indexOf(">", closeStart);
      if (closeEnd === -1) {
        cursor = source.length;
        break;
      }
      cursor = closeEnd + 1;
      TAG_PATTERN.lastIndex = cursor;
      continue;
    }
    if (!ALLOWED_TAGS.has(tag)) continue;
    if (closing) {
      if (!VOID_TAGS.has(tag)) output += `</${tag}>`;
      continue;
    }
    output += `<${tag}${rebuildAttributes(tag, match[3])}>`;
  }
  output += escapeText(source.slice(cursor));
  return output;
}

/** Plain-text version of an HTML body (for the text/plain part and the empty check). */
export function emailHtmlToText(html: string): string {
  return sanitizeEmailHtml(html)
    .replace(/<(br|\/p|\/div|\/li|\/h[1-4]|\/tr)>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
