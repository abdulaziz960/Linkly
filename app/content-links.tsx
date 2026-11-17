import Link from "next/link";
import type { ReactNode } from "react";
import JsonLd from "./JsonLd";

/** Text with [label](/path) or [label](https://...) links turned into real links; anything else stays plain text. */
export function withLinks(text: string): ReactNode[] {
  const parts: ReactNode[] = [];
  const pattern = /\[([^\]]+)\]\((\/(?!\/)[^)\s]*|https?:\/\/[^)\s]+|mailto:[^)\s]+)\)/g;
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text))) {
    if (match.index > last) parts.push(text.slice(last, match.index));
    const [, label, href] = match;
    parts.push(href.startsWith("/") ? <Link key={match.index} href={href}>{label}</Link> : href.startsWith("mailto:") ? <a key={match.index} href={href}>{label}</a> : <a key={match.index} href={href} rel="noopener">{label}</a>);
    last = match.index + match[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}


const SITE = "https://linklysa.io";

export type Crumb = { name: string; path?: string };

/** Visible breadcrumb trail plus its BreadcrumbList structured data. The last crumb is the current page (no link). */
export function Breadcrumbs({ items, lang }: { items: Crumb[]; lang: "ar" | "en" }) {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({ "@type": "ListItem", position: index + 1, name: item.name, ...(item.path ? { item: `${SITE}${item.path}` } : {}) }))
  };
  return (
    <nav className="crumbs" aria-label={lang === "en" ? "Breadcrumb" : "مسار التنقل"}>
      <JsonLd data={jsonLd} />
      <ol>
        {items.map((item, index) => (
          <li key={`${item.name}-${index}`}>{item.path && index < items.length - 1 ? <Link href={item.path}>{item.name}</Link> : <span aria-current={index === items.length - 1 ? "page" : undefined}>{item.name}</span>}</li>
        ))}
      </ol>
    </nav>
  );
}

