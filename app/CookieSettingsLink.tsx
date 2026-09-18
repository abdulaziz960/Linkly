"use client";

import { REOPEN_COOKIE_BANNER_EVENT } from "./CookieConsent";

export default function CookieSettingsLink({ label }: { label: string }) {
  return (
    <button type="button" className="legal-links-button" onClick={() => window.dispatchEvent(new Event(REOPEN_COOKIE_BANNER_EVENT))}>
      {label}
    </button>
  );
}
