import type { Metadata } from "next";
import Link from "next/link";
import "../../legal.css";

export const metadata: Metadata = {
  title: "Data Deletion | AudienceW",
  description: "AudienceW data deletion instructions"
};

export default function DataDeletionPageEn() {
  return (
    <main className="legal-page" dir="ltr" lang="en">
      <section className="legal-shell">
        <Link className="legal-brand" href="/en">
          <span className="legal-logo">A</span>
          AudienceW
        </Link>
        <h1>Data Deletion Instructions</h1>
        <p className="legal-updated">Last updated: July 27, 2026</p>

        <p>
          AudienceW users and account owners can request deletion of their data or disconnect linked channels at
          any time. Deletable data includes account data, conversations, customers, employees, tags, connection
          settings, and stored tokens.
        </p>

        <h2>How to request data deletion</h2>
        <ol>
          <li>Log in to your AudienceW account.</li>
          <li>Go to Settings &amp; Connections and disconnect any channels you no longer want to keep.</li>
          <li>To delete your full account data, send a deletion request to: marketing@audience.sa.</li>
          <li>Use the subject line: Data Deletion Request.</li>
          <li>Include your company name, registered email, and the channels you want deleted.</li>
        </ol>

        <h2>Deleting Meta data</h2>
        <p>
          When you request deletion of Meta data or disconnect a channel, we delete the stored access tokens and
          connection data for that channel and stop sending or receiving messages through it. You can also remove
          the app from your Meta Business account settings.
        </p>

        <h2>Processing time</h2>
        <p>
          We process data deletion requests within a reasonable period, and may retain limited records where
          required for legal compliance, abuse prevention, or dispute resolution.
        </p>

        <h2>Contact</h2>
        <div className="legal-contact">
          <p>To request data deletion: marketing@audience.sa</p>
        </div>

        <nav className="legal-links">
          <Link href="/en/privacy">Privacy policy</Link>
          <Link href="/en/terms">Terms of use</Link>
          <Link href="/en">Home</Link>
          <Link href="/data-deletion">العربية</Link>
        </nav>
      </section>
    </main>
  );
}
