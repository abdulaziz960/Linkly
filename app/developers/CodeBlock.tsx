"use client";

import { useState } from "react";

export default function CodeBlock({ code, label }: { code: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard blocked: the text is still selectable.
    }
  }

  return (
    <div className="dev-code">
      <div className="dev-code-bar">
        <span>{label ?? ""}</span>
        <button type="button" onClick={() => void copy()} aria-live="polite">{copied ? "تم النسخ" : "نسخ"}</button>
      </div>
      <pre dir="ltr"><code>{code}</code></pre>
    </div>
  );
}
