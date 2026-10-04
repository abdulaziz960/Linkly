"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge, Button, EmptyState, Segmented, Skeleton } from "../ds/primitives";
import { Dialog } from "../ds/Dialog";
import { useToast } from "../ds/Toast";
import Icon from "../ds/Icon";
import { STATUS_FILTERS, STATUS_LABEL, STATUS_TONE, availableActions, formatRequestDate, normalizeStatus, totalCount } from "./development-data";

type FeatureRequest = {
  id: string;
  title: string;
  description: string;
  status: string;
  rejectionReason: string;
  createdByName: string;
  companyName: string;
  createdAt: string;
};

type Filter = "all" | (typeof STATUS_FILTERS)[number];

export default function DevelopmentView() {
  const toast = useToast();
  const [requests, setRequests] = useState<FeatureRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [rejecting, setRejecting] = useState<FeatureRequest | null>(null);
  const [reason, setReason] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (filter !== "all") params.set("status", filter);
      const response = await fetch(`/api/admin/development/requests?${params.toString()}`);
      const json = await response.json();
      if (!json.ok) throw new Error("load failed");
      setRequests(json.data.requests);
      setCounts(json.data.counts);
      setFailed(false);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    load();
  }, [load]);

  async function updateStatus(id: string, status: string, rejectionReason?: string) {
    setBusyId(id);
    try {
      const response = await fetch(`/api/admin/development/requests/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, rejectionReason })
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json.ok) {
        toast("error", "تعذر تحديث الاقتراح", json.error);
        return false;
      }
      toast("success", status === "rejected" ? "تم رفض الاقتراح" : status === "resolved" ? "تم تحديد الاقتراح كمكتمل" : "تم قبول الاقتراح");
      await load();
      return true;
    } catch {
      toast("error", "تعذر تحديث الاقتراح", "تحقق من الاتصال وحاول مرة أخرى.");
      return false;
    } finally {
      setBusyId(null);
    }
  }

  async function confirmReject() {
    if (!rejecting || !reason.trim()) return;
    const ok = await updateStatus(rejecting.id, "rejected", reason.trim());
    if (ok) {
      setRejecting(null);
      setReason("");
    }
  }

  return (
    <>
      <div className="ds-toolbar">
        <Segmented
          label="تصفية الاقتراحات"
          value={filter}
          onChange={setFilter}
          options={[
            { value: "all", label: `الكل (${totalCount(counts)})` },
            ...STATUS_FILTERS.map((status) => ({ value: status, label: `${STATUS_LABEL[status]} (${counts[status] || 0})` }))
          ]}
        />
      </div>

      {loading ? (
        <div className="ds-dev-grid" aria-busy="true">
          {[0, 1, 2].map((index) => <div key={index} className="ds-card ds-card-pad" style={{ display: "grid", gap: 10 }}><Skeleton width="60%" height={16} /><Skeleton height={12} /><Skeleton width="40%" height={12} /></div>)}
        </div>
      ) : failed ? (
        <EmptyState icon="alert" title="تعذر تحميل الاقتراحات" description="حدث خطأ أثناء التحميل." action={<Button variant="outline" icon="refresh" onClick={() => { setLoading(true); void load(); }}>إعادة المحاولة</Button>} />
      ) : requests.length === 0 ? (
        <EmptyState icon="code" title="لا توجد اقتراحات حاليًا" description="ستظهر هنا أفكار وميزات يقترحها العملاء." />
      ) : (
        <div className="ds-dev-grid">
          {requests.map((item) => {
            const status = normalizeStatus(item.status);
            const actions = availableActions(item.status);
            return (
              <article key={item.id} className="ds-card ds-card-pad ds-dev-card">
                <div className="ds-dev-card-head">
                  <strong>{item.title}</strong>
                  <Badge tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</Badge>
                </div>
                <p className="ds-dev-description">{item.description}</p>
                <p className="ds-dev-by">
                  بواسطة {item.createdByName}{item.companyName ? ` — ${item.companyName}` : ""}
                  {item.createdAt ? ` · ${formatRequestDate(item.createdAt)}` : ""}
                </p>
                {status === "rejected" && item.rejectionReason ? (
                  <p className="ds-note"><Icon name="info" size={15} /><span>سبب الرفض: {item.rejectionReason}</span></p>
                ) : null}
                {actions.length ? (
                  <div className="ds-dev-actions">
                    {actions.includes("accept") ? <Button variant="primary" icon="check" loading={busyId === item.id} onClick={() => void updateStatus(item.id, "in_progress")}>قبول</Button> : null}
                    {actions.includes("resolve") ? <Button variant="primary" icon="checkCircle" loading={busyId === item.id} onClick={() => void updateStatus(item.id, "resolved")}>تحديد كمكتملة</Button> : null}
                    {actions.includes("reject") ? <Button variant="outline" disabled={busyId === item.id} onClick={() => { setReason(""); setRejecting(item); }}>رفض</Button> : null}
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      )}

      <Dialog
        open={Boolean(rejecting)}
        onClose={() => { if (!busyId) setRejecting(null); }}
        title="رفض الاقتراح"
        description={rejecting ? `سيظهر سبب الرفض لصاحب الاقتراح: «${rejecting.title}»` : undefined}
        footer={<><Button variant="outline" onClick={() => setRejecting(null)} disabled={Boolean(busyId)}>إلغاء</Button><Button variant="danger" loading={Boolean(busyId)} disabled={!reason.trim()} onClick={() => void confirmReject()}>تأكيد الرفض</Button></>}
      >
        <label className="ds-field">
          سبب الرفض
          <textarea data-autofocus className="ds-textarea" rows={4} placeholder="اشرح سبب رفض هذا الاقتراح…" value={reason} onChange={(event) => setReason(event.target.value)} />
        </label>
      </Dialog>
    </>
  );
}
