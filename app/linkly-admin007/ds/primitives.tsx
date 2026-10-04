"use client";

import { useId, useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import Link from "next/link";
import Icon, { type IconName } from "./Icon";

// ---------- Button ----------
type ButtonVariant = "primary" | "secondary" | "outline" | "ghost" | "danger";

export function Button({ variant = "secondary", loading, icon, children, className, disabled, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; loading?: boolean; icon?: IconName }) {
  return (
    <button type="button" {...rest} className={`ds-btn${className ? ` ${className}` : ""}`} data-variant={variant} data-loading={loading || undefined} disabled={disabled || loading} aria-busy={loading || undefined}>
      {loading ? <span className="ds-spinner" aria-hidden="true" /> : icon ? <Icon name={icon} size={16} /> : null}
      {children}
    </button>
  );
}

export function LinkButton({ href, variant = "secondary", icon, children }: { href: string; variant?: ButtonVariant; icon?: IconName; children: ReactNode }) {
  return (
    <Link href={href} className="ds-btn" data-variant={variant}>
      {icon ? <Icon name={icon} size={16} /> : null}
      {children}
    </Link>
  );
}

// ---------- Badge ----------
export type Tone = "neutral" | "success" | "warning" | "danger" | "info";

// Always paired with an icon or text - never colour alone.
export function Badge({ tone = "neutral", children, dot = true }: { tone?: Tone; children: ReactNode; dot?: boolean }) {
  return (
    <span className="ds-badge" data-tone={tone}>
      {dot ? <i aria-hidden="true" /> : null}
      {children}
    </span>
  );
}

// ---------- Skeleton / states ----------
export function Skeleton({ width, height = 14, radius, className }: { width?: number | string; height?: number | string; radius?: number | string; className?: string }) {
  return <span className={`ds-skeleton${className ? ` ${className}` : ""}`} style={{ width, height, borderRadius: radius }} aria-hidden="true" />;
}

export function EmptyState({ icon = "info", title, description, action }: { icon?: IconName; title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="ds-state" data-kind="empty">
      <span className="ds-state-icon"><Icon name={icon} size={22} /></span>
      <strong>{title}</strong>
      {description ? <p>{description}</p> : null}
      {action ? <div className="ds-state-action">{action}</div> : null}
    </div>
  );
}

export function ErrorState({ title = "تعذر تحميل البيانات", description = "حدث خطأ غير متوقع. حاول مرة أخرى.", onRetry, kind = "error" }: { title?: string; description?: string; onRetry?: () => void; kind?: "error" | "offline" | "denied" | "session" }) {
  const icon: IconName = kind === "offline" ? "refresh" : kind === "denied" || kind === "session" ? "shield" : "alert";
  return (
    <div className="ds-state" data-kind="error" role="alert">
      <span className="ds-state-icon"><Icon name={icon} size={22} /></span>
      <strong>{title}</strong>
      <p>{description}</p>
      {onRetry ? <div className="ds-state-action"><Button variant="outline" icon="refresh" onClick={onRetry}>إعادة المحاولة</Button></div> : null}
    </div>
  );
}

// ---------- Tooltip (hover + keyboard focus, no library) ----------
export function Tooltip({ text, children }: { text: string; children: ReactNode }) {
  const id = useId();
  return (
    <span className="ds-tooltip" aria-describedby={id}>
      {children}
      <span role="tooltip" id={id} className="ds-tooltip-body">{text}</span>
    </span>
  );
}

export function HelpTerm({ term, definition }: { term: string; definition: string }) {
  return (
    <Tooltip text={definition}>
      <button type="button" className="ds-term" aria-label={`${term}: ${definition}`}>{term}<Icon name="info" size={13} /></button>
    </Tooltip>
  );
}

// ---------- Segmented control ----------
export function Segmented<T extends string>({ value, onChange, options, label }: { value: T; onChange: (value: T) => void; options: { value: T; label: string }[]; label: string }) {
  return (
    <div className="ds-segmented" role="radiogroup" aria-label={label}>
      {options.map((option) => (
        <button key={option.value} type="button" role="radio" aria-checked={value === option.value} data-active={value === option.value || undefined} onClick={() => onChange(option.value)}>
          {option.label}
        </button>
      ))}
    </div>
  );
}

// ---------- Stat card ----------
export function StatCard({ label, value, hint, delta, href, tone = "neutral", icon, help }: {
  label: string;
  value: ReactNode;
  hint: string;
  delta?: { value: number; goodWhen: "up" | "down" } | null;
  href?: string;
  tone?: Tone;
  icon?: IconName;
  help?: { term: string; definition: string };
}) {
  const body = (
    <>
      <div className="ds-stat-top">
        <span className="ds-stat-label">{help ? <HelpTerm term={label} definition={help.definition} /> : label}</span>
        {icon ? <span className="ds-stat-icon" data-tone={tone}><Icon name={icon} size={16} /></span> : null}
      </div>
      <strong className="ds-stat-value">{value}</strong>
      <div className="ds-stat-foot">
        {delta ? <DeltaChip value={delta.value} goodWhen={delta.goodWhen} /> : null}
        <span>{hint}</span>
      </div>
    </>
  );
  return href ? <Link href={href} className="ds-stat" data-tone={tone}>{body}</Link> : <div className="ds-stat" data-tone={tone}>{body}</div>;
}

export function DeltaChip({ value, goodWhen }: { value: number; goodWhen: "up" | "down" }) {
  if (!Number.isFinite(value)) return null;
  const direction = value === 0 ? "flat" : value > 0 ? "up" : "down";
  const good = direction === "flat" ? null : (direction === goodWhen);
  return (
    <span className="ds-delta" data-good={good === null ? "flat" : good ? "yes" : "no"}>
      {direction !== "flat" ? <Icon name={direction === "up" ? "trendUp" : "trendDown"} size={13} /> : null}
      <span dir="ltr">{value > 0 ? "+" : ""}{Math.round(value)}%</span>
    </span>
  );
}

// ---------- Collapsible section helper ----------
export function Section({ title, description, actions, children, id }: { title: string; description?: string; actions?: ReactNode; children: ReactNode; id?: string }) {
  return (
    <section className="ds-section" id={id} aria-labelledby={id ? `${id}-h` : undefined}>
      <header className="ds-section-head">
        <div>
          <h2 id={id ? `${id}-h` : undefined}>{title}</h2>
          {description ? <p>{description}</p> : null}
        </div>
        {actions ? <div className="ds-section-actions">{actions}</div> : null}
      </header>
      {children}
    </section>
  );
}

export function useDisclosure(initial = false) {
  const [open, setOpen] = useState(initial);
  return { open, setOpen, toggle: () => setOpen((value) => !value) };
}

// ---------- Switch ----------
export function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: (next: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} disabled={disabled} className="ds-switch" onClick={() => onChange(!checked)}>
      <span aria-hidden="true" />
    </button>
  );
}
