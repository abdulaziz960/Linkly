"use client";

import { useLanguage } from "./i18n";

export default function AdminPageHeader({
  eyebrow,
  title,
  description
}: {
  eyebrow: [string, string];
  title: [string, string];
  description?: [string, string];
}) {
  const { t } = useLanguage();

  return (
    <header className="admin-header">
      <div className="admin-header-copy">
        <p>{t(eyebrow[0], eyebrow[1])}</p>
        <h1>{t(title[0], title[1])}</h1>
        {description ? <span>{t(description[0], description[1])}</span> : null}
      </div>
    </header>
  );
}
