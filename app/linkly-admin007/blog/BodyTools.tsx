"use client";

import { useRef, useState } from "react";
import type { SiteLink } from "../../../lib/blog-links";
import { imageMarkdown } from "../../../lib/blog-body";
import { callAdminApi } from "../content-api";

type Panel = "link" | "image" | null;
type Uploaded = { url: string; width: number; height: number };

/**
 * Buttons above an article body that write the link and picture syntax for the author: an internal link from a list of the site's
 * pages and posts (or any address), and a picture uploaded here with its alt text. They insert at the cursor, replacing the selection.
 */
export default function BodyTools({ textareaId, value, onChange, lang, links, images = true }: { textareaId: string; value: string; onChange: (value: string) => void; lang: "ar" | "en"; links: SiteLink[]; images?: boolean }) {
  const en = lang === "en";
  const [panel, setPanel] = useState<Panel>(null);
  const [text, setText] = useState("");
  const [target, setTarget] = useState("");
  const [alt, setAlt] = useState("");
  const [uploaded, setUploaded] = useState<Uploaded | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const listId = `${textareaId}-links`;

  function area() {
    return document.getElementById(textareaId) as HTMLTextAreaElement | null;
  }

  function openPanel(next: Exclude<Panel, null>) {
    if (panel === next) return setPanel(null);
    const el = area();
    // The selected words become the link's text.
    setText(next === "link" && el ? value.slice(el.selectionStart, el.selectionEnd).trim() : "");
    setTarget("");
    setAlt("");
    setUploaded(null);
    setMessage("");
    setPanel(next);
  }

  function insert(snippet: string, ownLine: boolean) {
    const el = area();
    const start = el?.selectionStart ?? value.length;
    const end = el?.selectionEnd ?? value.length;
    const before = value.slice(0, start);
    const after = value.slice(end);
    const gap = (text: string, edge: "end" | "start") => {
      if (!text) return "";
      const newlines = (edge === "end" ? /\n*$/ : /^\n*/).exec(text)?.[0].length ?? 0;
      return "\n".repeat(Math.max(0, 2 - newlines));
    };
    const lead = ownLine ? gap(before, "end") : "";
    const trail = ownLine ? gap(after, "start") : "";
    onChange(`${before}${lead}${snippet}${trail}${after}`);
    setPanel(null);
    const caret = before.length + lead.length + snippet.length;
    setTimeout(() => {
      // Give the cursor back to the text only if nothing else has taken the focus meanwhile (a quick move to the next field must stay there).
      const active = document.activeElement;
      if (active && active !== document.body && active !== area() && !(active as HTMLElement).closest?.(".blog-body-tools")) return;
      area()?.focus();
      area()?.setSelectionRange(caret, caret);
    }, 0);
  }

  function insertLink() {
    const address = target.trim();
    const label = text.trim();
    if (!label) return setMessage(en ? "Write the link text." : "اكتب نص الرابط.");
    if (!/^(\/(?!\/)[^\s)]*|https?:\/\/[^\s)]+)$/.test(address)) return setMessage(en ? "Pick a page, or write a path like /pricing or a full https:// address." : "اختر صفحة، أو اكتب مسارًا مثل /pricing أو رابطًا كاملًا يبدأ بـ https://");
    insert(`[${label.replace(/[\[\]]/g, "")}](${address})`, false);
  }

  async function upload(file: File) {
    setBusy(true);
    setMessage("");
    const form = new FormData();
    form.append("file", file);
    const result = await callAdminApi<Uploaded & { bytes: number }>("/api/admin/media", { method: "POST", body: form });
    setBusy(false);
    if (!result.ok || !result.data) return setMessage(result.error || (en ? "The picture could not be uploaded." : "تعذر رفع الصورة"));
    setUploaded({ url: result.data.url, width: result.data.width, height: result.data.height });
  }

  function insertImage() {
    if (!uploaded) return setMessage(en ? "Upload a picture first." : "ارفع صورة أولًا.");
    if (!alt.trim()) return setMessage(en ? "Write the alt text: it is what search engines and screen readers read." : "اكتب النص البديل (Alt): تقرؤه محركات البحث وقارئات الشاشة.");
    insert(imageMarkdown(alt, uploaded.url, uploaded.width, uploaded.height), true);
  }

  const enter = (action: () => void) => (event: React.KeyboardEvent) => {
    if (event.key === "Enter") { event.preventDefault(); action(); }
  };

  return (
    <div className="blog-body-tools">
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 6 }}>
        <button type="button" className="ds-btn" data-variant="outline" aria-expanded={panel === "link"} onClick={() => openPanel("link")}>{en ? "Add internal link" : "إضافة رابط داخلي"}</button>
        {images ? <button type="button" className="ds-btn" data-variant="outline" aria-expanded={panel === "image"} onClick={() => openPanel("image")}>{en ? "Add picture" : "إضافة صورة"}</button> : null}
      </div>
      {panel === "link" ? (
        <div className="admin-seo-box" style={{ display: "grid", gap: 8, padding: 12, marginBottom: 8 }}>
          <label className="ds-field">{en ? "Link text" : "نص الرابط"}<input className="ds-input" value={text} onChange={(event) => setText(event.target.value)} maxLength={120} onKeyDown={enter(insertLink)} /></label>
          <label className="ds-field">{en ? "Page (pick from the list or write an address)" : "الصفحة (اختر من القائمة أو اكتب عنوانًا)"}
            <input className="ds-input" dir="ltr" list={listId} value={target} onChange={(event) => setTarget(event.target.value)} placeholder="/pricing" maxLength={500} onKeyDown={enter(insertLink)} />
            <datalist id={listId}>{links.map((link) => <option key={link.path} value={link.path}>{link.label}</option>)}</datalist>
          </label>
          {message ? <small role="alert" className="ds-field-error">{message}</small> : null}
          <div><button type="button" className="ds-btn" data-variant="primary" onClick={insertLink}>{en ? "Insert" : "إدراج"}</button></div>
        </div>
      ) : null}
      {images && panel === "image" ? (
        <div className="admin-seo-box" style={{ display: "grid", gap: 8, padding: 12, marginBottom: 8 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <button type="button" className="ds-btn" data-variant="outline" disabled={busy} onClick={() => fileRef.current?.click()}>{busy ? (en ? "Uploading..." : "جارٍ الرفع...") : uploaded ? (en ? "Replace picture" : "استبدال الصورة") : (en ? "Upload picture" : "رفع صورة")}</button>
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/avif" hidden onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void upload(file); }} />
            {uploaded ? <small>{en ? `Converted to WebP (${uploaded.width}×${uploaded.height})` : `تم التحويل إلى WebP (${uploaded.width}×${uploaded.height})`}</small> : null}
          </div>
          {uploaded ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={uploaded.url} alt="" style={{ maxWidth: 220, maxHeight: 120, borderRadius: 8, objectFit: "cover" }} />
          ) : null}
          <label className="ds-field">{en ? "Alt text" : "النص البديل (Alt) — يصف الصورة"}<input className="ds-input" value={alt} onChange={(event) => setAlt(event.target.value)} maxLength={200} onKeyDown={enter(insertImage)} /></label>
          {message ? <small role="alert" className="ds-field-error">{message}</small> : null}
          <div><button type="button" className="ds-btn" data-variant="primary" disabled={busy} onClick={insertImage}>{en ? "Insert" : "إدراج"}</button></div>
        </div>
      ) : null}
    </div>
  );
}
