"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import type { AdminSummary } from "../api/admin/summary/route";
import Icon from "./ds/Icon";
import { NAV_GROUPS, type NavItem } from "./nav";
import { canAccessPath } from "../../lib/admin-permissions";
import { useAdminPermissions } from "./ds/permissions-context";

function badgeFor(item: NavItem, summary: AdminSummary | null) {
  if (!summary || !item.badge) return null;
  if (item.badge === "renewals") return summary.renewalsDue ? { count: summary.renewalsDue, tone: "danger" as const } : null;
  if (item.badge === "support") return summary.supportOpen ? { count: summary.supportOpen, tone: summary.supportUrgent ? ("danger" as const) : ("warning" as const) } : null;
  return summary.developmentPending ? { count: summary.developmentPending, tone: "warning" as const } : null;
}

function isActive(pathname: string, href: string) {
  if (href === "/linkly-admin007") return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function AdminSidebar({ summary }: { summary: AdminSummary | null }) {
  const pathname = usePathname();
  const { permissions } = useAdminPermissions();
  // Links to sections the member cannot open are not shown (the server blocks them regardless).
  const groups = NAV_GROUPS.map((group) => ({ ...group, items: group.items.filter((item) => canAccessPath(permissions, item.href)) })).filter((group) => group.items.length > 0);

  return (
    <aside className="ds-sidebar" aria-label="القائمة الجانبية">
      <div className="ds-sidebar-head">
        <Link href="/linkly-admin007" className="ds-brand" aria-label="Linkly - نظرة عامة">
          <Image src="/assets/linkly-logo.png" alt="" width={44} height={24} priority />
          <span>Linkly</span>
        </Link>
      </div>

      <nav className="ds-sidebar-scroll" aria-label="تنقل لوحة التحكم">
        {groups.map((group) => (
          <div className="ds-nav-group" key={group.label} role="group" aria-label={group.label}>
            <div className="ds-nav-label">{group.label}</div>
            {group.items.map((item) => {
              const badge = badgeFor(item, summary);
              const active = isActive(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className="ds-nav-link"
                  aria-current={active ? "page" : undefined}
                  data-badge={badge ? "" : undefined}
                  aria-label={badge ? `${item.label}، ${badge.count} تنبيه` : undefined}
                >
                  <Icon name={item.icon} size={19} />
                  <span className="ds-nav-text">{item.label}</span>
                  {badge ? <span className="ds-count" data-tone={badge.tone}>{badge.count > 99 ? "99+" : badge.count}</span> : null}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

    </aside>
  );
}
