"use client";

import Icon from "./Icon";

const format = (value: number) => new Intl.NumberFormat("ar-SA", { numberingSystem: "latn" }).format(value);

export default function Pagination({ page, pageCount, total, pageSize, onPageChange, onPageSizeChange, pageSizes = [10, 25, 50] }: {
  page: number;
  pageCount: number;
  total: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  pageSizes?: number[];
}) {
  if (total === 0) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <nav className="ds-pagination" aria-label="التنقل بين الصفحات">
      <span>{format(from)}–{format(to)} من {format(total)}</span>
      <div className="ds-pagination-controls">
        <label>
          <span className="ds-sr-only">عدد الصفوف في الصفحة</span>
          <select className="ds-select" value={pageSize} onChange={(event) => onPageSizeChange(Number(event.target.value))} style={{ minHeight: 34, width: "auto" }}>
            {pageSizes.map((size) => <option key={size} value={size}>{size} / صفحة</option>)}
          </select>
        </label>
        <button type="button" className="ds-icon-btn" onClick={() => onPageChange(page - 1)} disabled={page <= 1} aria-label="الصفحة السابقة"><Icon name="chevronRight" size={16} /></button>
        <span aria-current="page" style={{ minWidth: 70, textAlign: "center", fontWeight: 700 }}>{format(page)} / {format(pageCount)}</span>
        <button type="button" className="ds-icon-btn" onClick={() => onPageChange(page + 1)} disabled={page >= pageCount} aria-label="الصفحة التالية"><Icon name="chevronLeft" size={16} /></button>
      </div>
    </nav>
  );
}
