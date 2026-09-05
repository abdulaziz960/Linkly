"use client";

import { useRef, useState, type DragEvent } from "react";
import Link from "next/link";
import { SUPPORT_CATEGORIES, SUPPORT_PRIORITIES } from "../../../lib/support";
import { categoryLabel, priorityLabel } from "../../../lib/support-labels";

type Attachment = { type: "image" | "audio" | "document"; name: string; dataUrl: string; mimeType: string };

const MAX_FILE_BYTES = 8 * 1024 * 1024;

function attachmentTypeFor(mime: string): Attachment["type"] {
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("audio/")) return "audio";
  return "document";
}

function fileToAttachment(file: File): Promise<Attachment | null> {
  if (file.size > MAX_FILE_BYTES) return Promise.resolve(null);
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = typeof reader.result === "string" ? reader.result : "";
      if (!dataUrl) return resolve(null);
      resolve({ type: attachmentTypeFor(file.type), name: file.name, dataUrl, mimeType: file.type });
    };
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(file);
  });
}

export default function CreateTicketModal({
  lang,
  onClose,
  onCreated
}: {
  lang: "ar" | "en";
  onClose: () => void;
  onCreated: (ticket: { id: string; ticketNumber: string }) => void;
}) {
  const isEnglish = lang === "en";
  const [subject, setSubject] = useState("");
  const [category, setCategory] = useState("other");
  const [priority, setPriority] = useState("normal");
  const [description, setDescription] = useState("");
  const [relatedUrl, setRelatedUrl] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState<{ id: string; ticketNumber: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const addFiles = async (files: FileList | null) => {
    if (!files) return;
    const parsed = await Promise.all(Array.from(files).slice(0, 5 - attachments.length).map(fileToAttachment));
    setAttachments((current) => [...current, ...parsed.filter((item): item is Attachment => item !== null)]);
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    addFiles(event.dataTransfer.files);
  };

  const submit = async () => {
    setError("");
    if (!subject.trim()) return setError(isEnglish ? "Subject is required" : "عنوان المشكلة مطلوب");
    if (!description.trim()) return setError(isEnglish ? "Description is required" : "وصف المشكلة مطلوب");

    setSubmitting(true);
    try {
      const response = await fetch("/api/support/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject, category, priority, description, relatedUrl, attachments })
      });
      const json = await response.json();
      if (!json.ok) {
        setError(json.error || (isEnglish ? "Something went wrong" : "حدث خطأ ما"));
        setSubmitting(false);
        return;
      }
      setSuccess({ id: json.data.id, ticketNumber: json.data.ticketNumber });
    } catch {
      setError(isEnglish ? "Something went wrong" : "حدث خطأ ما");
    }
    setSubmitting(false);
  };

  if (success) {
    return (
      <div className="support-modal-backdrop" role="dialog" aria-modal="true">
        <div className="support-modal support-modal-success">
          <b className="support-success-check">✓</b>
          <h2>{isEnglish ? "Ticket created successfully" : "تم إنشاء التذكرة بنجاح"}</h2>
          <p>{isEnglish ? `Ticket number: ${success.ticketNumber}` : `رقم التذكرة: ${success.ticketNumber}`}</p>
          <div className="support-modal-actions">
            <Link href={`/dashboard/support/tickets/${success.id}`} className="support-cta-primary" onClick={() => onCreated(success)}>
              {isEnglish ? "View ticket" : "عرض التذكرة"}
            </Link>
            <button type="button" className="support-cta-secondary" onClick={() => onCreated(success)}>
              {isEnglish ? "Back to support" : "العودة للدعم الفني"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="support-modal-backdrop" role="dialog" aria-modal="true" onClick={(event) => event.target === event.currentTarget && onClose()}>
      <div className="support-modal">
        <h2>{isEnglish ? "Create support ticket" : "إنشاء تذكرة دعم"}</h2>
        <p className="support-modal-subtitle">
          {isEnglish ? "Explain your issue and our team will help as soon as possible." : "اشرح لنا المشكلة وسيساعدك فريق الدعم في أقرب وقت."}
        </p>

        <label className="support-field">
          <span>{isEnglish ? "Subject" : "عنوان المشكلة"}</span>
          <input
            value={subject}
            onChange={(event) => setSubject(event.target.value)}
            placeholder={isEnglish ? "e.g. Trouble connecting WhatsApp" : "مثال: مشكلة في ربط حساب واتساب"}
            maxLength={200}
          />
        </label>

        <div className="support-field-row">
          <label className="support-field">
            <span>{isEnglish ? "Category" : "نوع المشكلة"}</span>
            <select value={category} onChange={(event) => setCategory(event.target.value)}>
              {SUPPORT_CATEGORIES.map((value) => (
                <option key={value} value={value}>{categoryLabel(value, lang)}</option>
              ))}
            </select>
          </label>
          <label className="support-field">
            <span>{isEnglish ? "Priority" : "الأولوية"}</span>
            <select value={priority} onChange={(event) => setPriority(event.target.value)}>
              {SUPPORT_PRIORITIES.map((value) => (
                <option key={value} value={value}>{priorityLabel(value, lang)}</option>
              ))}
            </select>
          </label>
        </div>

        <label className="support-field">
          <span>{isEnglish ? "Description" : "وصف المشكلة"}</span>
          <textarea
            rows={5}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder={isEnglish ? "Describe the issue in detail, and what you were trying to do when it happened…" : "اشرح المشكلة بالتفصيل، وما الذي كنت تحاول القيام به عند حدوثها..."}
            maxLength={8000}
          />
        </label>

        <label className="support-field">
          <span>{isEnglish ? "Related page / URL (optional)" : "رابط الصفحة (اختياري)"}</span>
          <input value={relatedUrl} onChange={(event) => setRelatedUrl(event.target.value)} placeholder="https://" />
        </label>

        <div
          className="support-dropzone"
          onDragOver={(event) => event.preventDefault()}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          <input
            ref={fileInputRef}
            type="file"
            hidden
            multiple
            onChange={(event) => addFiles(event.target.files)}
          />
          <span>{isEnglish ? "Drag files here or click to upload" : "اسحب الملفات هنا أو اضغط للرفع"}</span>
        </div>
        {attachments.length > 0 ? (
          <ul className="support-attachment-list">
            {attachments.map((attachment, index) => (
              <li key={`${attachment.name}-${index}`}>
                <span>{attachment.name}</span>
                <button type="button" onClick={() => setAttachments((current) => current.filter((_, i) => i !== index))}>×</button>
              </li>
            ))}
          </ul>
        ) : null}

        {error ? <p className="support-form-error">{error}</p> : null}

        <div className="support-modal-actions">
          <button type="button" className="support-cta-primary" disabled={submitting} onClick={submit}>
            {submitting ? (isEnglish ? "Sending…" : "جاري الإرسال…") : (isEnglish ? "Submit ticket" : "إرسال التذكرة")}
          </button>
          <button type="button" className="support-cta-secondary" onClick={onClose}>
            {isEnglish ? "Cancel" : "إلغاء"}
          </button>
        </div>
      </div>
    </div>
  );
}
