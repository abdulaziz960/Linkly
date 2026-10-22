"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type ViewerItem = {
  url: string;
  name: string;
  type: "image" | "sticker" | "document";
  mimeType?: string;
};

// Opened in the browser's own viewer (new tab / frame) only when the content can't run as a page on our
// origin: raster images and PDFs, re-typed below so a file that lies about its type still can't. Anything
// else (SVG, HTML, office files...) is offered as a download.
const PREVIEWABLE_IMAGE = /^image\/(png|jpe?g|gif|webp|avif|bmp)$/i;

function previewKind(item: ViewerItem): "image" | "pdf" | "download" {
  const mime = (item.mimeType || "").toLowerCase().split(";")[0];
  if (item.type === "image" || item.type === "sticker") return PREVIEWABLE_IMAGE.test(mime) || !mime ? "image" : "download";
  if (mime === "application/pdf" || /\.pdf$/i.test(item.name)) return "pdf";
  return "download";
}

/** A blob: URL for the attachment (data: URLs can't be opened in a new tab), with a forced safe type. */
async function toBlobUrl(item: ViewerItem, kind: "image" | "pdf" | "download"): Promise<string> {
  const blob = await (await fetch(item.url)).blob();
  const type = kind === "pdf" ? "application/pdf" : kind === "image" ? (PREVIEWABLE_IMAGE.test(blob.type) ? blob.type : "image/jpeg") : "application/octet-stream";
  return URL.createObjectURL(new Blob([blob], { type }));
}

type Props = {
  items: ViewerItem[];
  startIndex: number;
  language: "ar" | "en";
  onClose: () => void;
};

/**
 * Full-screen viewer for a conversation's images and files: zoom, previous / next across the conversation,
 * download and open in a new tab. Keyboard: Esc closes, arrows move (following the page direction), +/- zoom.
 */
export default function MediaViewer({ items, startIndex, language, onClose }: Props) {
  const t = (ar: string, en: string) => (language === "en" ? en : ar);
  const [index, setIndex] = useState(Math.min(Math.max(startIndex, 0), Math.max(items.length - 1, 0)));
  const [zoom, setZoom] = useState(1);
  const [blobUrl, setBlobUrl] = useState("");
  const closeRef = useRef<HTMLButtonElement>(null);
  const item = items[index];
  const kind = item ? previewKind(item) : "download";
  const rtl = language !== "en";

  const go = useCallback((step: number) => {
    if (items.length < 2) return;
    setIndex((current) => (current + step + items.length) % items.length);
  }, [items.length]);

  useEffect(() => setZoom(1), [index]);

  useEffect(() => {
    if (!item) return;
    let url = "";
    let cancelled = false;
    setBlobUrl("");
    toBlobUrl(item, kind).then((created) => {
      if (cancelled) {
        URL.revokeObjectURL(created);
        return;
      }
      url = created;
      setBlobUrl(created);
    }).catch(() => undefined);
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [item, kind]);

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); onClose(); }
      else if (event.key === "ArrowLeft") go(rtl ? 1 : -1);
      else if (event.key === "ArrowRight") go(rtl ? -1 : 1);
      else if (event.key === "+" || event.key === "=") setZoom((value) => Math.min(4, value + 0.5));
      else if (event.key === "-") setZoom((value) => Math.max(1, value - 0.5));
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, [go, onClose, rtl]);

  if (!item) return null;

  return (
    <div className="media-viewer" role="dialog" aria-modal="true" aria-label={t("عارض الوسائط", "Media viewer")} dir={rtl ? "rtl" : "ltr"} onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <header className="media-viewer-bar">
        <div className="media-viewer-title">
          <b dir="auto">{item.name}</b>
          {items.length > 1 ? <span>{index + 1} / {items.length}</span> : null}
        </div>
        <div className="media-viewer-actions">
          {kind === "image" ? (
            <>
              <button type="button" onClick={() => setZoom((value) => Math.max(1, value - 0.5))} disabled={zoom <= 1} aria-label={t("تصغير", "Zoom out")}>−</button>
              <button type="button" onClick={() => setZoom(1)} aria-label={t("الحجم الأصلي", "Reset zoom")}>{Math.round(zoom * 100)}%</button>
              <button type="button" onClick={() => setZoom((value) => Math.min(4, value + 0.5))} disabled={zoom >= 4} aria-label={t("تكبير", "Zoom in")}>+</button>
            </>
          ) : null}
          {blobUrl && kind !== "download" ? <a href={blobUrl} target="_blank" rel="noopener noreferrer">{t("فتح في تبويب جديد", "Open in new tab")}</a> : null}
          <a href={blobUrl || item.url} download={item.name}>{t("تنزيل", "Download")}</a>
          <button ref={closeRef} type="button" className="media-viewer-close" onClick={onClose} aria-label={t("إغلاق", "Close")}>×</button>
        </div>
      </header>

      <div className="media-viewer-stage" data-zoomed={zoom > 1 || undefined}>
        {kind === "image" ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.url}
            alt={item.name}
            // Zoom changes the layout width (not a transform) so the stage can scroll around the enlarged image.
            style={zoom > 1 ? { width: `${zoom * 100}%`, maxWidth: "none", maxHeight: "none" } : undefined}
            onClick={() => setZoom((value) => (value > 1 ? 1 : 2))}
            draggable={false}
          />
        ) : kind === "pdf" ? (
          blobUrl ? <iframe src={blobUrl} title={item.name} /> : <p className="media-viewer-note">{t("جاري تجهيز المعاينة…", "Preparing preview…")}</p>
        ) : (
          <div className="media-viewer-file">
            <span aria-hidden="true">📄</span>
            <b dir="auto">{item.name}</b>
            <p>{t("لا تتوفر معاينة لهذا النوع من الملفات. نزّله لفتحه.", "No preview for this file type. Download it to open it.")}</p>
            <a className="btn primary" href={blobUrl || item.url} download={item.name}>{t("تنزيل الملف", "Download file")}</a>
          </div>
        )}
      </div>

      {items.length > 1 ? (
        <>
          <button type="button" className="media-viewer-nav prev" onClick={() => go(-1)} aria-label={t("السابق", "Previous")}>{rtl ? "›" : "‹"}</button>
          <button type="button" className="media-viewer-nav next" onClick={() => go(1)} aria-label={t("التالي", "Next")}>{rtl ? "‹" : "›"}</button>
        </>
      ) : null}
    </div>
  );
}
