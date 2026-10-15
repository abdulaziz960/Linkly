/**
 * Turns the body of an incoming email into the plain text a person would read.
 *
 * HTML emails carry a <style> block, comments, tables for layout and entities such as &nbsp; / &zwnj;.
 * Stripping only the tags leaves all of that as text (the CSS source showed up as the customer's message),
 * so the head, styles, scripts and comments are dropped as a whole, block elements become line breaks,
 * entities are decoded and the blank lines are tidied.
 */

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", zwnj: "", zwj: "", shy: "", ensp: " ", emsp: " ", thinsp: " ",
  ndash: "–", mdash: "—", hellip: "…", laquo: "«", raquo: "»", copy: "©", reg: "®", bull: "•", middot: "·", rlm: "", lrm: ""
};

export function decodeEntities(value: string): string {
  return value
    .replace(/&#(\d+);/g, (_match, code: string) => {
      const point = Number(code);
      return point > 0 && point < 0x110000 ? String.fromCodePoint(point) : "";
    })
    .replace(/&#x([0-9a-f]+);/gi, (_match, code: string) => {
      const point = parseInt(code, 16);
      return point > 0 && point < 0x110000 ? String.fromCodePoint(point) : "";
    })
    .replace(/&([a-z]+);/gi, (match, name: string) => (name.toLowerCase() in NAMED_ENTITIES ? NAMED_ENTITIES[name.toLowerCase()] : match));
}

/** CSS that leaked into plain text (an HTML body posted as the "text" part): rules and @media blocks. */
function removeLeakedCss(text: string): string {
  if (!/[{}]/.test(text) || !/(@media|font-family|padding|margin|display\s*:|color\s*:)/i.test(text)) return text;
  let out = text;
  // @media (...) { rule { ... } rule { ... } } : repeat until nothing nests any more.
  for (let pass = 0; pass < 4; pass += 1) {
    const next = out.replace(/@[a-z-]+[^{};]*\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/gi, " ").replace(/[A-Za-z0-9_\s.,#:>+~*[\]="'()-]*\{[^{}]*:[^{}]*\}/g, " ");
    if (next === out) break;
    out = next;
  }
  return out.replace(/\/\*[\s\S]*?\*\//g, " ");
}

export function emailBodyToText(value: string | undefined | null): string {
  let text = String(value ?? "");
  if (!text.trim()) return "";

  if (/<[a-z!/][\s\S]*>/i.test(text)) {
    text = text
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<(head|style|script|title|noscript)\b[\s\S]*?<\/\1\s*>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|tr|li|h[1-6]|table|blockquote|section|article|header|footer)\s*>/gi, "\n")
      .replace(/<(td|th)\b[^>]*>/gi, " ")
      .replace(/<li\b[^>]*>/gi, "• ")
      .replace(/<[^>]+>/g, " ");
  }

  text = decodeEntities(text);
  text = removeLeakedCss(text);

  return text
    .replace(/\r\n?/g, "\n")
    .replace(/[​-‏‪-‮⁠﻿]/g, "")
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
