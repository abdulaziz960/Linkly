import type { ReactNode } from "react";

// Small decorative icons (24px grid, same stroke as the sidebar) for places that used emoji or text symbols.
// Always decorative: the text beside the icon carries the meaning.
const paths = {
  greet: <><path d="M4 5h16v11H9l-5 4V5Z" /><path d="M8.5 9.5c1 2.4 6 2.4 7 0" /></>,
  menu: <path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01" />,
  price: <><path d="m4 12 8-8h7v7l-8 8-7-7Z" /><path d="M15 9h.01" /></>,
  search: <><circle cx="11" cy="11" r="7" /><path d="m16.5 16.5 4 4" /></>,
  handover: <path d="M7 17 17 7M9 7h8v8" />,
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  bolt: <path d="m13 2-7 11h6l-1 9 7-12h-6l1-8Z" />,
  mail: <><path d="M4 6h16v12H4z" /><path d="m4 8 8 6 8-6" /></>,
  flask: <path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 1.8 3h10.4a2 2 0 0 0 1.8-3l-5-9V3M7.5 15h9" />,
  attach: <path d="m20 11-8 8a5 5 0 0 1-7-7l8.5-8.5a3.5 3.5 0 0 1 5 5L10 17a2 2 0 0 1-3-3l7.5-7.5" />
} satisfies Record<string, ReactNode>;

export type LineIconName = keyof typeof paths;

export default function LineIcon({ name }: { name: LineIconName }) {
  return <svg className="line-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">{paths[name]}</svg>;
}
