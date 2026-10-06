"use client";

import { useState } from "react";

/** The client logo when it has one, otherwise the first letter of its name. */
export default function ClientAvatar({ tenantId, name, hasLogo }: { tenantId: string; name: string; hasLogo: boolean }) {
  const [failed, setFailed] = useState(false);
  if (!hasLogo || failed) return <span className="ds-avatar" aria-hidden="true">{name.slice(0, 1) || "ع"}</span>;
  return (
    <span className="ds-avatar ds-avatar-logo" aria-hidden="true">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`/api/admin/clients/${encodeURIComponent(tenantId)}/logo`} alt="" loading="lazy" onError={() => setFailed(true)} />
    </span>
  );
}
