"use client";

import { useMemo, useState } from "react";
import type { AdminActionLog } from "@prisma/client";
import CustomSelect from "../../components/CustomSelect";
import { useLanguage } from "../i18n";
import { formatNumber } from "../utils";

function formatDate(value: string, lang: "ar" | "en") {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(lang === "ar" ? "ar-SA-u-nu-latn" : "en-US", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

export default function AdminActionsView({ actions }: { actions: AdminActionLog[] }) {
  const { t, language } = useLanguage();
  const [admin, setAdmin] = useState("all");
  const [action, setAction] = useState("all");
  const [query, setQuery] = useState("");

  const admins = useMemo(() => Array.from(new Set(actions.map((row) => row.adminEmail))).sort(), [actions]);
  const actionTypes = useMemo(() => Array.from(new Set(actions.map((row) => row.action))).sort(), [actions]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return actions.filter((row) => {
      if (admin !== "all" && row.adminEmail !== admin) return false;
      if (action !== "all" && row.action !== action) return false;
      if (!needle) return true;
      return [row.adminEmail, row.adminName, row.action, row.targetType, row.targetId, row.details].some((value) => value.toLowerCase().includes(needle));
    });
  }, [actions, admin, action, query]);

  return (
    <section className="admin-card">
      <div className="admin-card-head">
        <div>
          <h2>{t("إجراءات الأدمن", "Admin actions")}</h2>
          <p>{t(`${formatNumber(visible.length)} من ${formatNumber(actions.length)} إجراء`, `${visible.length} of ${actions.length} actions`)}</p>
        </div>
      </div>
      <div className="logs-filters">
        <label className="logs-search">
          <span className="sr-only">{t("بحث", "Search")}</span>
          <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("ابحث بالبريد، الإجراء أو الهدف…", "Search by email, action, or target…")} />
        </label>
        <div className="logs-filter-grid">
          <label>
            <span>{t("الأدمن", "Admin")}</span>
            <CustomSelect value={admin} onChange={setAdmin} options={[{ value: "all", label: t("الكل", "All") }, ...admins.map((email) => ({ value: email, label: email }))]} />
          </label>
          <label>
            <span>{t("نوع الإجراء", "Action type")}</span>
            <CustomSelect value={action} onChange={setAction} options={[{ value: "all", label: t("الكل", "All") }, ...actionTypes.map((item) => ({ value: item, label: item }))]} />
          </label>
        </div>
      </div>
      <div className="admin-list">
        {visible.map((row) => (
          <div className="admin-list-row" key={row.id}>
            <div>
              <strong>{row.action}</strong>
              <span>{row.adminName ? `${row.adminName} · ${row.adminEmail}` : row.adminEmail}</span>
              {row.targetType ? <small>{row.targetType}: {row.targetId}</small> : null}
              {row.details ? <small>{row.details}</small> : null}
            </div>
            <span className="admin-pill">{formatDate(row.createdAt, language === "ar" ? "ar" : "en")}</span>
          </div>
        ))}
        {!visible.length ? <p className="admin-empty-state">{t("لا توجد إجراءات مطابقة.", "No matching actions.")}</p> : null}
      </div>
    </section>
  );
}
