"use client";

import { useCallback, useEffect, useState } from "react";
import { parseTimestamp } from "../../utils";
import { relativeTime } from "../../activity";
import { useConfirm } from "../../ds/Dialog";
import { Button, EmptyState, ErrorState, Skeleton } from "../../ds/primitives";
import { adminRequest, Field } from "../../ds/forms";
import { useToast } from "../../ds/Toast";
import Icon from "../../ds/Icon";

type Note = { id: string; authorName: string; body: string; createdAt: string };
const MAX = 2000;

export default function ClientNotesPanel({ tenantId, generatedAt }: { tenantId: string; generatedAt: number }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [notes, setNotes] = useState<Note[] | null>(null);
  const [loadError, setLoadError] = useState("");
  const [body, setBody] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState("");

  const load = useCallback(async () => {
    setLoadError("");
    const response = await adminRequest<Note[]>(`/api/admin/clients/${tenantId}/notes`);
    if (!response.ok) { setLoadError(response.error); setNotes([]); return; }
    setNotes(response.data);
  }, [tenantId]);

  useEffect(() => { void load(); }, [load]);

  async function add() {
    if (saving) return;
    const text = body.trim();
    if (!text) { setError("اكتب نص الملاحظة."); return; }
    if (text.length > MAX) { setError(`الحد الأقصى ${MAX} حرف.`); return; }
    setSaving(true);
    const response = await adminRequest<Note>(`/api/admin/clients/${tenantId}/notes`, { method: "POST", body: { body: text } });
    setSaving(false);
    // The text stays in the box when saving fails so nothing is lost.
    if (!response.ok) { setError(response.error); return; }
    setNotes((current) => [response.data, ...(current ?? [])]);
    setBody("");
    setError("");
    toast("success", "تمت إضافة الملاحظة");
  }

  async function remove(note: Note) {
    const ok = await confirm({ title: "حذف الملاحظة", description: "سيتم حذف هذه الملاحظة الداخلية نهائيًا ويُسجَّل الإجراء في سجل التدقيق.", confirmLabel: "حذف", tone: "danger" });
    if (!ok) return;
    setDeleting(note.id);
    const response = await adminRequest(`/api/admin/clients/${tenantId}/notes?noteId=${encodeURIComponent(note.id)}`, { method: "DELETE" });
    setDeleting("");
    if (!response.ok) { toast("error", "تعذر حذف الملاحظة", response.error); return; }
    setNotes((current) => (current ?? []).filter((item) => item.id !== note.id));
    toast("success", "تم حذف الملاحظة");
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <p className="ds-note" style={{ margin: 0 }}><Icon name="shield" size={16} /><span>ملاحظات داخلية لفريق Linkly فقط ولا تظهر للعميل. لا تكتب فيها كلمات مرور أو مفاتيح.</span></p>
      <div className="ds-card ds-card-pad" style={{ display: "grid", gap: 10 }}>
        <Field label="ملاحظة جديدة" error={error} hint={`${body.length} / ${MAX}`}>
          {(p) => <textarea {...p} className="ds-textarea" value={body} maxLength={MAX + 200} onChange={(event) => { setBody(event.target.value); setError(""); }} placeholder="مثال: اتصلنا بالعميل بخصوص التجديد وطلب مهلة 3 أيام." />}
        </Field>
        <div><Button variant="primary" icon="plus" loading={saving} onClick={add}>إضافة الملاحظة</Button></div>
      </div>

      {notes === null ? (
        <div className="ds-card ds-card-pad" aria-busy="true"><Skeleton width="60%" height={14} /><div style={{ height: 10 }} /><Skeleton width="85%" height={14} /></div>
      ) : loadError ? (
        <ErrorState title="تعذر تحميل الملاحظات" description={loadError} onRetry={load} />
      ) : notes.length === 0 ? (
        <EmptyState icon="edit" title="لا توجد ملاحظات بعد" description="دوّن هنا متابعات الفريق مع هذا العميل." />
      ) : (
        <ul className="ds-feed ds-card ds-card-pad" aria-label="الملاحظات">
          {notes.map((note) => (
            <li key={note.id}>
              <span className="ds-avatar" aria-hidden="true">{note.authorName.slice(0, 1) || "؟"}</span>
              <div className="ds-feed-body">
                <strong style={{ whiteSpace: "pre-wrap", fontWeight: 600 }}>{note.body}</strong>
                <span>{note.authorName || "عضو في الفريق"} · {relativeTime(parseTimestamp(note.createdAt) || Date.parse(note.createdAt), generatedAt)}</span>
              </div>
              <Button variant="ghost" icon="trash" loading={deleting === note.id} aria-label="حذف الملاحظة" onClick={() => remove(note)} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
