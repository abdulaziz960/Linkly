import type { Metadata } from "next";
import Link from "next/link";
import "../../legal.css";

export const metadata: Metadata = {
  title: "Terms of Service | AudienceW",
  description: "AudienceW terms of service"
};

export default function TermsPageEn() {
  return (
    <main className="legal-page" dir="ltr" lang="en">
      <section className="legal-shell">
        <Link className="legal-brand" href="/en">
          <span className="legal-logo">A</span>
          AudienceW
        </Link>
        <h1>Terms of Use</h1>
        <p className="legal-updated">Last updated: July 27, 2026</p>

        <p>
          By using the AudienceW platform, you agree to these terms. The platform is designed to manage customer
          communication across the digital channels connected to your account, based on the permissions you or
          your company grant.
        </p>

        <h2>Using the service</h2>
        <ul>
          <li>The platform must be used in compliance with local regulations and the policies of connected platforms such as Meta, Google, and Telegram.</li>
          <li>You are responsible for the accuracy of the connection data and permissions you grant to the platform.</li>
          <li>The platform must not be used to send spam, unauthorized, or non-compliant messages.</li>
        </ul>

        <h2>Channels and connections</h2>
        <p>
          Some features depend on external approvals from channel providers such as Meta and Google. Permissions,
          restrictions, or messaging windows may change according to those platforms' policies, which may require
          updating settings or obtaining additional approvals.
        </p>

        <h2>User accounts</h2>
        <p>
          Login credentials must be kept confidential. The account owner or an administrator can manage employees,
          permissions, and usage limits according to the plan and available settings.
        </p>

        <h2>Data and content</h2>
        <p>
          The customer retains ownership of their data and conversation content. AudienceW uses this data only to
          provide the service and operate the features requested within the platform.
        </p>

        <h2>Changes to the service</h2>
        <p>
          We may update features, terms, or connection mechanisms to improve the service or comply with changes
          from external platforms. This page's date will be updated whenever material changes are made.
        </p>

        <h2>Contact</h2>
        <div className="legal-contact">
          <p>For questions about these terms, contact us at: marketing@audience.sa</p>
        </div>

        <nav className="legal-links">
          <Link href="/en/privacy">Privacy policy</Link>
          <Link href="/en/data-deletion">Data deletion</Link>
          <Link href="/en">Home</Link>
          <Link href="/terms">العربية</Link>
        </nav>
      </section>
    </main>
  );
}
