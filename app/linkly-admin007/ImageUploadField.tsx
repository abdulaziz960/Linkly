"use client";

import { useRef, useState } from "react";
import { callAdminApi } from "./content-api";

/** A URL field with an upload button: the file is converted to WebP on the server and its /media/... link is filled in. */
export default function ImageUploadField({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function upload(file: File) {
    setBusy(true);
    setMessage("");
    const form = new FormData();
    form.append("file", file);
    const result = await callAdminApi<{ url: string; width: number; height: number; bytes: number }>("/api/admin/media", { method: "POST", body: form });
    setBusy(false);
    if (!result.ok || !result.data) return setMessage(result.error || "تعذر رفع الصورة");
    onChange(result.data.url);
    setMessage(`تم الرفع وتحويلها إلى WebP (${result.data.width}×${result.data.height}، ${Math.round(result.data.bytes / 1024)} ك.ب)`);
  }

  return (
    <div className="ds-field">
      {label}
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <input className="ds-input" dir="ltr" value={value} onChange={(event) => onChange(event.target.value)} maxLength={500} placeholder={placeholder ?? "https://... أو ارفع صورة"} style={{ flex: 1 }} />
        <button type="button" className="ds-btn" data-variant="outline" disabled={busy} onClick={() => inputRef.current?.click()}>{busy ? "جارٍ الرفع..." : "رفع صورة"}</button>
        <input ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/avif" hidden onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void upload(file); }} />
      </div>
      {value ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={value} alt="" style={{ maxWidth: 220, maxHeight: 120, borderRadius: 8, marginTop: 8, objectFit: "cover" }} />
      ) : null}
      {message ? <small>{message}</small> : null}
    </div>
  );
}
