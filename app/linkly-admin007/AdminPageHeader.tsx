"use client";

import { useLanguage } from "./i18n";

export default function AdminPageHeader({
  eyebrow,
  title,
  description,
  actions
}: {
  eyebrow: [string, string];
  title: [string, string];
  description?: [string, string];
  actions?: React.ReactNode;
}) {
  const { t } = useLanguage();

  return (
    <header className="ds-page-head">
      <div>
        <p className="ds-page-eyebrow">{t(eyebrow[0], eyebrow[1])}</p>
        <h1>{t(title[0], title[1])}</h1>
        {description ? <p>{t(description[0], description[1])}</p> : null}
      </div>
      {actions ? <div className="ds-section-actions">{actions}</div> : null}
    </header>
  );
}
