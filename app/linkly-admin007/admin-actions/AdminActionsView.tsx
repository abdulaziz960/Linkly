"use client";

import { useMemo, useState } from "react";
import type { AdminActionLog } from "@prisma/client";
import { formatNumber } from "../utils";
import { Badge, Button, EmptyState, Section } from "../ds/primitives";
import { Drawer } from "../ds/Dialog";
import Icon from "../ds/Icon";
import { TARGET_LABEL, actionLabel, actionTone, filterActions, formatActionDate, paginate, parseDetails } from "./actions-data";

const PAGE_SIZE = 25;

export default function AdminActionsView({ actions }: { actions: AdminActionLog[] }) {
  const [admin, setAdmin] = useState("all");
  const [action, setAction] = useState("all");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<AdminActionLog | null>(null);

  const admins = useMemo(() => Array.from(new Set(actions.map((row) => row.adminEmail))).sort(), [actions]);
  const actionTypes = useMemo(() => Array.from(new Set(actions.map((row) => row.action))).sort(), [actions]);
  const filtered = useMemo(() => filterActions(actions, { admin, action, query }), [actions, admin, action, query]);
  const paged = useMemo(() => paginate(filtered, page, PAGE_SIZE), [filtered, page]);
  const hasFilters = admin !== "all" || action !== "all" || Boolean(query.trim());

  function reset() {
    setAdmin("all");
    setAction("all");
    setQuery("");
    setPage(1);
  }

  return (
    <>
      <Section title="سجل تدقيق الأدمن" description={`${formatNumber(filtered.length)} من ${formatNumber(actions.length)} إجراء. يسجّل من نفّذ كل إجراء حساس على المنصة.`}>
        <div className="ds-toolbar">
          <div className="ds-search">
            <Icon name="search" size={17} />
            <input className="ds-input" type="search" placeholder="ابحث بالبريد أو الإجراء أو الهدف…" aria-label="بحث في الإجراءات" value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} />
          </div>
          <select className="ds-select" aria-label="الأدمن" value={admin} onChange={(event) => { setAdmin(event.target.value); setPage(1); }}>
            <option value="all">كل الأدمن</option>
            {admins.map((email) => <option key={email} value={email}>{email}</option>)}
          </select>
          <select className="ds-select" aria-label="نوع الإجراء" value={action} onChange={(event) => { setAction(event.target.value); setPage(1); }}>
            <option value="all">كل الإجراءات</option>
            {actionTypes.map((item) => <option key={item} value={item}>{actionLabel(item)}</option>)}
          </select>
          {hasFilters ? <div className="ds-toolbar-end"><Button variant="ghost" onClick={reset}>مسح التصفية</Button></div> : null}
        </div>

        {actions.length === 0 ? (
          <EmptyState icon="receipt" title="لا توجد إجراءات مسجّلة" description="ستظهر هنا إجراءات فريق الإدارة الحساسة عند تنفيذها." />
        ) : filtered.length === 0 ? (
          <EmptyState icon="search" title="لا توجد إجراءات مطابقة" description="جرّب تغيير البحث أو مسح التصفية." action={<Button variant="outline" onClick={reset}>مسح التصفية</Button>} />
        ) : (
          <div className="ds-table-wrap">
            <table className="ds-table">
              <thead>
                <tr>
                  <th scope="col">الإجراء</th>
                  <th scope="col">المنفّذ</th>
                  <th scope="col">الهدف</th>
                  <th scope="col">الوقت</th>
                  <th scope="col"><span className="ds-sr-only">التفاصيل</span></th>
                </tr>
              </thead>
              <tbody>
                {paged.rows.map((row) => (
                  <tr key={row.id}>
                    <td data-cell="main"><Badge tone={actionTone(row.action)}>{actionLabel(row.action)}</Badge></td>
                    <td data-label="المنفّذ">
                      <div className="ds-cell-stack"><strong>{row.adminName || row.adminEmail}</strong>{row.adminName ? <small><bdi dir="ltr">{row.adminEmail}</bdi></small> : null}</div>
                    </td>
                    <td data-label="الهدف">
                      {row.targetType ? <div className="ds-cell-stack"><strong>{TARGET_LABEL[row.targetType] ?? row.targetType}</strong><small><bdi dir="ltr">{row.targetId}</bdi></small></div> : "—"}
                    </td>
                    <td data-label="الوقت">{formatActionDate(row.createdAt)}</td>
                    <td>
                      <div className="ds-cell-actions">
                        <Button variant="ghost" icon="info" onClick={() => setSelected(row)} aria-label={`تفاصيل إجراء ${actionLabel(row.action)}`}>التفاصيل</Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="ds-table-foot ds-table-foot-split">
              <span>يُعرض {formatNumber(paged.rows.length)} من {formatNumber(filtered.length)}</span>
              {paged.pageCount > 1 ? (
                <nav className="ds-pager" aria-label="ترقيم الصفحات">
                  <Button variant="outline" disabled={paged.page === 1} onClick={() => setPage(paged.page - 1)}>السابق</Button>
                  <span>صفحة {formatNumber(paged.page)} من {formatNumber(paged.pageCount)}</span>
                  <Button variant="outline" disabled={paged.page === paged.pageCount} onClick={() => setPage(paged.page + 1)}>التالي</Button>
                </nav>
              ) : null}
            </div>
          </div>
        )}
      </Section>

      <Drawer
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        title={selected ? actionLabel(selected.action) : ""}
        description={selected ? formatActionDate(selected.createdAt) : undefined}
        footer={<Button variant="outline" onClick={() => setSelected(null)}>إغلاق</Button>}
      >
        {selected ? (
          <dl className="ds-detail-list">
            <div><dt>المنفّذ</dt><dd>{selected.adminName || "—"}</dd></div>
            <div><dt>البريد</dt><dd dir="ltr">{selected.adminEmail}</dd></div>
            <div><dt>الإجراء</dt><dd dir="ltr">{selected.action}</dd></div>
            {selected.targetType ? <div><dt>نوع الهدف</dt><dd>{TARGET_LABEL[selected.targetType] ?? selected.targetType}</dd></div> : null}
            {selected.targetId ? <div><dt>معرّف الهدف</dt><dd dir="ltr">{selected.targetId}</dd></div> : null}
            {parseDetails(selected.details).map(([key, value, previous]) => <div key={key}><dt>{key}</dt><dd>{previous !== undefined ? <><span style={{ color: "var(--ds-text-faint)", textDecoration: "line-through" }}>{previous}</span> ← <b style={{ color: "var(--ds-success)" }}>{value}</b></> : value}</dd></div>)}
          </dl>
        ) : null}
      </Drawer>
    </>
  );
}
