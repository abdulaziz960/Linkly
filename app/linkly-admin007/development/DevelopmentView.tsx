"use client";

import { useCallback, useEffect, useState } from "react";
import { useLanguage } from "../i18n";

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

const STATUS_FILTERS = ["pending", "in_progress", "resolved", "rejected"] as const;

function statusLabel(status: string, t: (ar: string, en: string) => string) {
  if (status === "in_progress") return t("جاري العمل عليها", "In progress");
  if (status === "resolved") return t("تم التنفيذ", "Resolved");
  if (status === "rejected") return t("مرفوضة", "Rejected");
  return t("قيد المراجعة", "Pending");
}

function statusClass(status: string) {
  if (status === "in_progress") return "admin-dev-badge-progress";
  if (status === "resolved") return "admin-dev-badge-resolved";
  if (status === "rejected") return "admin-dev-badge-rejected";
  return "admin-dev-badge-pending";
}

export default function DevelopmentView() {
  const { t } = useLanguage();
  const [requests, setRequests] = useState<FeatureRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    if (statusFilter) params.set("status", statusFilter);
    const response = await fetch(`/api/admin/development/requests?${params.toString()}`);
    const json = await response.json();
    if (json.ok) {
      setRequests(json.data.requests);
      setCounts(json.data.counts);
    }
    setLoading(false);
  }, [statusFilter]);

  useEffect(() => {
    load();
  }, [load]);

  async function updateStatus(id: string, status: string, reason?: string) {
    setBusyId(id);
    const response = await fetch(`/api/admin/development/requests/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, rejectionReason: reason })
    });
    const json = await response.json();
    setBusyId(null);
    if (json.ok) {
      setRejectingId(null);
      setRejectionReason("");
      load();
    }
  }

  return (
    <section className="admin-card">
      <div className="admin-dev-filters">
        <button type="button" className={statusFilter === null ? "active" : ""} onClick={() => setStatusFilter(null)}>
          {t("الكل", "All")}
        </button>
        {STATUS_FILTERS.map((status) => (
          <button
            key={status}
            type="button"
            className={statusFilter === status ? "active" : ""}
            onClick={() => setStatusFilter(statusFilter === status ? null : status)}
          >
            {statusLabel(status, t)} <b>{counts[status] || 0}</b>
          </button>
        ))}
      </div>

      {loading ? (
        <p className="admin-dev-empty">{t("جاري التحميل…", "Loading…")}</p>
      ) : requests.length === 0 ? (
        <p className="admin-dev-empty">{t("لا توجد اقتراحات حاليًا.", "No suggestions yet.")}</p>
      ) : (
        <div className="admin-dev-cards">
          {requests.map((item) => (
            <div key={item.id} className="admin-dev-card">
              <div className="admin-dev-card-head">
                <strong>{item.title}</strong>
                <span className={`admin-dev-badge ${statusClass(item.status)}`}>{statusLabel(item.status, t)}</span>
              </div>
              <p className="admin-dev-card-description">{item.description}</p>
              <p className="admin-dev-card-by">
                {t("بواسطة", "By")}: {item.createdByName}
                {item.companyName ? ` — ${item.companyName}` : ""}
              </p>
              {item.status === "rejected" && item.rejectionReason ? (
                <p className="admin-dev-card-reason">
                  {t("سبب الرفض", "Rejection reason")}: {item.rejectionReason}
                </p>
              ) : null}

              {item.status === "pending" ? (
                rejectingId === item.id ? (
                  <div className="admin-dev-reject-box">
                    <textarea
                      placeholder={t("سبب الرفض...", "Reason for rejection...")}
                      value={rejectionReason}
                      onChange={(event) => setRejectionReason(event.target.value)}
                      rows={2}
                    />
                    <div className="admin-dev-card-actions">
                      <button type="button" onClick={() => updateStatus(item.id, "rejected", rejectionReason)} disabled={busyId === item.id || !rejectionReason.trim()}>
                        {t("تأكيد الرفض", "Confirm rejection")}
                      </button>
                      <button type="button" onClick={() => { setRejectingId(null); setRejectionReason(""); }}>
                        {t("إلغاء", "Cancel")}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="admin-dev-card-actions">
                    <button type="button" className="is-accept" onClick={() => updateStatus(item.id, "in_progress")} disabled={busyId === item.id}>
                      {t("قبول", "Accept")}
                    </button>
                    <button type="button" className="is-reject" onClick={() => setRejectingId(item.id)} disabled={busyId === item.id}>
                      {t("رفض", "Reject")}
                    </button>
                  </div>
                )
              ) : item.status === "in_progress" ? (
                <div className="admin-dev-card-actions">
                  <button type="button" className="is-accept" onClick={() => updateStatus(item.id, "resolved")} disabled={busyId === item.id}>
                    {t("تحديد كمكتملة", "Mark as resolved")}
                  </button>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
