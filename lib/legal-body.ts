// The text format of the legal pages (see lib/legal-content.ts), shared by the page and its tests.

export type LegalBlock =
  | { type: "h2" | "h3" | "p"; text: string }
  | { type: "ul" | "ol"; items: string[] }
  | { type: "callout"; paragraphs: string[] }
  | { type: "actions" };

/**
 * "## " and "### " open a heading, "- " is a bullet, "1. " a numbered step, "> " a line of the contact box. Text separated by blank lines
 * is a paragraph (lines of one paragraph are joined). Consecutive bullets, steps or box lines form one group; a blank line closes it.
 */
export function parseLegalBody(body: string): LegalBlock[] {
  const blocks: LegalBlock[] = [];
  let paragraph: string[] = [];
  let group: "ul" | "ol" | "callout" | null = null;
  const flush = () => {
    const text = paragraph.join(" ").replace(/\s+/g, " ").trim();
    if (text) blocks.push({ type: "p", text });
    paragraph = [];
  };
  for (const raw of body.replace(/\r/g, "").split("\n")) {
    const line = raw.trim();
    if (!line) { flush(); group = null; continue; }
    const last = blocks[blocks.length - 1];
    if (line === "{contact-actions}") { flush(); group = null; blocks.push({ type: "actions" }); continue; }
    if (line.startsWith("### ")) { flush(); group = null; blocks.push({ type: "h3", text: line.slice(4).trim() }); continue; }
    if (line.startsWith("## ")) { flush(); group = null; blocks.push({ type: "h2", text: line.slice(3).trim() }); continue; }
    const bullet = /^-\s+(.*)$/.exec(line);
    const step = /^\d+\.\s+(.*)$/.exec(line);
    const boxed = /^>\s?(.*)$/.exec(line);
    if (bullet || step) {
      flush();
      const type = bullet ? "ul" : "ol";
      const text = (bullet ?? step)![1].trim();
      if (group === type && last && last.type === type) last.items.push(text);
      else blocks.push({ type, items: [text] });
      group = type;
    } else if (boxed) {
      flush();
      if (group === "callout" && last && last.type === "callout") last.paragraphs.push(boxed[1].trim());
      else blocks.push({ type: "callout", paragraphs: [boxed[1].trim()] });
      group = "callout";
    } else {
      group = null;
      paragraph.push(line);
    }
  }
  flush();
  return blocks.filter((block) => block.type === "actions" || ("text" in block ? block.text : "items" in block ? block.items.length : block.paragraphs.length) !== 0);
}

/** The text of a page as a visitor reads it (links reduced to their words), one space between words: what the page tests compare. */
export function legalPlainText(page: { title: string; updated: string; body: string }): string {
  const plain = (text: string) => text.replace(/\[([^\]]+)\]\([^)\s]+\)/g, "$1");
  const parts = [page.title, page.updated];
  for (const block of parseLegalBody(page.body)) {
    if ("text" in block) parts.push(plain(block.text));
    else if ("items" in block) parts.push(...block.items.map(plain));
    else if ("paragraphs" in block) parts.push(...block.paragraphs.map(plain));
  }
  return parts.join(" ").replace(/\s+/g, " ").trim();
}
