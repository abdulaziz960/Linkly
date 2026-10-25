import type { ReactNode } from "react";

/** Placeholder lines shown while a list is on its way. Announced once, not line by line. */
export function SkeletonLines({ count = 5, label }: { count?: number; label: string }) {
  return (
    <div className="skeleton-lines" role="status" aria-label={label} aria-busy="true">
      {Array.from({ length: count }, (_, index) => <span key={index} className="skeleton-line" style={{ width: `${88 - (index % 3) * 14}%` }} />)}
    </div>
  );
}

/** Table rows of placeholder cells, for tables whose data has not arrived. */
export function SkeletonTableRows({ columns, rows = 4, label }: { columns: number; rows?: number; label: string }) {
  return (
    <>
      {Array.from({ length: rows }, (_, row) => (
        <tr key={row} className="skeleton-row" aria-hidden={row > 0 ? "true" : undefined}>
          {Array.from({ length: columns }, (_, column) => (
            <td key={column}>{row === 0 && column === 0 ? <span className="visually-hidden" role="status">{label}</span> : null}<span className="skeleton-line" style={{ width: `${column === 0 ? 70 : 50}%` }} /></td>
          ))}
        </tr>
      ))}
    </>
  );
}

/** An empty list that says what the page is for and offers the one thing to do next. */
export function EmptyState({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return (
    <div className="empty-state">
      <strong>{title}</strong>
      <p>{description}</p>
      {action ? <div className="empty-state-action">{action}</div> : null}
    </div>
  );
}
