import type { ReactNode } from "react";
import WorkspaceHeroPill from "../workspaces/WorkspaceHeroPill";

/**
 * The header every dashboard page starts with: the page's one H1, a short description, the page's main actions and,
 * when the page sits inside another, a small path above the title. The look follows the page's family (`variant`),
 * so moving a page onto it changes nothing visually; `extra` is for the few things a page keeps under its text.
 */
export type PageHeaderVariant = "plain" | "campaigns" | "reports";

const VARIANT_CLASS: Record<PageHeaderVariant, string> = {
  plain: "page-hero",
  campaigns: "campaigns-hero",
  reports: "reports-hero"
};

export default function PageHeader({
  title,
  eyebrow,
  description,
  path,
  actions,
  actionsClassName,
  extra,
  variant = "plain"
}: {
  title: ReactNode;
  eyebrow?: ReactNode;
  description?: ReactNode;
  /** A short trail such as "Settings / Branding", shown above the title. */
  path?: ReactNode;
  actions?: ReactNode;
  actionsClassName?: string;
  extra?: ReactNode;
  variant?: PageHeaderVariant;
}) {
  const actionsClass = actionsClassName ?? (variant === "reports" ? "reports-hero-actions" : variant === "plain" ? "page-hero-actions" : "");
  return (
    <header className={`page-header ${VARIANT_CLASS[variant]}`}>
      <div className="page-header-text">
        {path ? <nav className="page-header-path" aria-label="path">{path}</nav> : null}
        {eyebrow ? <span>{eyebrow}</span> : null}
        <h1>{title}</h1>
        {description}
        {extra}
      </div>
      {actions ? <div className={`page-header-actions ${actionsClass}`.trim()}>{actions}</div> : null}
      <WorkspaceHeroPill />
    </header>
  );
}
