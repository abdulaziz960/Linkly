import { Fragment } from "react";

// http(s) URLs and bare "www." addresses. Trailing punctuation that usually ends a sentence is left out of
// the link ("see https://x.sa/a." links to https://x.sa/a).
const URL_PATTERN = /(?:https?:\/\/|www\.)[^\s<>"'`]+/gi;
const TRAILING = /[.,;:!?؟،؛)\]}'"»]+$/;

/** The href for a matched address, or null when it is not a plain web link (only http and https open). */
export function safeHref(raw: string): string | null {
  const candidate = /^www\./i.test(raw) ? `https://${raw}` : raw;
  try {
    const url = new URL(candidate);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

/** Splits text into plain parts and links: [{ text }, { text, href }, ...]. */
export function linkifyParts(text: string): Array<{ text: string; href?: string }> {
  const parts: Array<{ text: string; href?: string }> = [];
  let last = 0;
  for (const match of text.matchAll(URL_PATTERN)) {
    const start = match.index ?? 0;
    const raw = match[0];
    const trailing = raw.match(TRAILING)?.[0] ?? "";
    const address = trailing ? raw.slice(0, -trailing.length) : raw;
    const href = address ? safeHref(address) : null;
    if (!href) continue;
    if (start > last) parts.push({ text: text.slice(last, start) });
    parts.push({ text: address, href });
    last = start + address.length;
  }
  if (last < text.length) parts.push({ text: text.slice(last) });
  return parts;
}

/**
 * Message text with every web address as a clickable link that opens in a new tab. The rest stays plain
 * text (React escapes it), and nothing but http/https ever becomes a link.
 */
export default function LinkifiedText({ text }: { text: string }) {
  return (
    <>
      {linkifyParts(text).map((part, index) => part.href ? (
        <a key={index} className="message-link" href={part.href} target="_blank" rel="noopener noreferrer nofollow" dir="ltr">{part.text}</a>
      ) : (
        <Fragment key={index}>{part.text}</Fragment>
      ))}
    </>
  );
}
