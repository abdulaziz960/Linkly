import type { ReactNode } from "react";

export function PageHeader({
  title,
  description,
  eyebrow,
  actions
}: {
  title: string;
  description?: string;
  eyebrow?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="ds-page-header">
      <div>
        {eyebrow ? <span>{eyebrow}</span> : null}
        <h1>{title}</h1>
        {description ? <p>{description}</p> : null}
      </div>
      {actions ? <div className="ds-page-header-actions">{actions}</div> : null}
    </header>
  );
}

export function LoadingSkeleton({ rows = 3, label = "جارٍ تحميل المحتوى" }: { rows?: number; label?: string }) {
  return (
    <div className="ds-skeleton" role="status" aria-label={label}>
      <span className="ds-skeleton-title" />
      {Array.from({ length: rows }, (_, index) => <span key={index} />)}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="ds-empty-state">
      <span aria-hidden="true">◎</span>
      <h3>{title}</h3>
      <p>{description}</p>
      {action ? <div>{action}</div> : null}
    </div>
  );
}

export function StatusBadge({ tone, children }: { tone: "success" | "warning" | "danger" | "info" | "neutral"; children: ReactNode }) {
  return <span className={`ds-status-badge ${tone}`}><i aria-hidden="true" />{children}</span>;
}
