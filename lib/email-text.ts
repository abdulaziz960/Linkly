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

/** An email that spaces every line from the next with a blank line (layout tables turned into text) is read as one flow. */
function dropUniformBlankLines(text: string): string {
  const chunks = text.split(/\n[ \t]*\n/);
  if (chunks.length < 4) return text;
  const singleLine = chunks.filter((chunk) => !chunk.includes("\n")).length;
  return singleLine / chunks.length >= 0.8 ? chunks.join("\n") : text;
}

/** A one-time code laid out in one cell per digit ("4", "0", "8", "7" or "4 0 8 7") reads as the number it is. */
function joinSpacedDigits(lines: string[]): string[] {
  const out: string[] = [];
  let run: string[] = [];
  const flush = () => {
    if (run.length >= 3) out.push(run.join(""));
    else out.push(...run);
    run = [];
  };
  for (const line of lines) {
    if (/^\d$/.test(line)) {
      run.push(line);
      continue;
    }
    flush();
    out.push(/^\d(?: \d){2,9}$/.test(line) ? line.replace(/ /g, "") : line);
  }
  flush();
  return out;
}

/** The same sentence twice (a hidden preheader above the visible text) is shown once. */
function dropRepeatedLines(lines: string[]): string[] {
  const seen = new Set<string>();
  return lines.filter((line) => {
    if (line.length < 12) return true;
    if (seen.has(line)) return false;
    seen.add(line);
    return true;
  });
}

export function emailBodyToText(value: string | undefined | null): string {
  let text = String(value ?? "");
  if (!text.trim()) return "";

  const isHtml = /<[a-z!/][\s\S]*>/i.test(text);
  if (isHtml) {
    text = text
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<(head|style|script|title|noscript)\b[\s\S]*?<\/\1\s*>/gi, " ")
      // The hidden "preheader" a sender puts first for the mailbox preview is not part of the message.
      .replace(/<(div|span|p)\b[^>]*(?:display\s*:\s*none|mso-hide\s*:\s*all)[^>]*>[\s\S]*?<\/\1\s*>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|tr|li|h[1-6]|table|blockquote|section|article|header|footer)\s*>/gi, "\n")
      .replace(/<(td|th)\b[^>]*>/gi, " ")
      .replace(/<li\b[^>]*>/gi, "• ")
      .replace(/<[^>]+>/g, " ");
  }

  text = decodeEntities(text);
  text = removeLeakedCss(text);

  text = text
    .replace(/\r\n?/g, "\n")
    .replace(/[\u200b-\u200f\u202a-\u202e\u2060\ufeff]/g, "")
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  text = dropUniformBlankLines(text);
  // Layout tables leave stray empty lines between the real ones; a person's own paragraphs (plain text) keep theirs.
  const lines = text.split("\n");
  const kept = isHtml ? lines.filter((line) => line.trim() !== "") : lines;
  return dropRepeatedLines(joinSpacedDigits(kept))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
