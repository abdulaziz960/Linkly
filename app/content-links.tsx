import Link from "next/link";
import type { ReactNode } from "react";

/** Text with [label](/path) or [label](https://...) links turned into real links; anything else stays plain text. */
export function withLinks(text: string): ReactNode[] {
  const parts: ReactNode[] = [];
  const pattern = /\[([^\]]+)\]\((\/(?!\/)[^)\s]*|https?:\/\/[^)\s]+)\)/g;
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text))) {
    if (match.index > last) parts.push(text.slice(last, match.index));
    const [, label, href] = match;
    parts.push(href.startsWith("/") ? <Link key={match.index} href={href}>{label}</Link> : <a key={match.index} href={href} rel="noopener">{label}</a>);
    last = match.index + match[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

