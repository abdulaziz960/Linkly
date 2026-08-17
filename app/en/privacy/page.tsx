import type { Metadata } from "next";
import Link from "next/link";
import "../../legal.css";

export const metadata: Metadata = {
  title: "Privacy Policy | AudienceW",
  description: "AudienceW privacy policy"
};

export default function PrivacyPageEn() {
  return (
    <main className="legal-page" dir="ltr" lang="en">
      <section className="legal-shell">
        <Link className="legal-brand" href="/en">
          <span className="legal-logo">A</span>
          AudienceW
        </Link>
        <h1>Privacy Policy</h1>
        <p className="legal-updated">Last updated: July 27, 2026</p>

        <p>
          AudienceW is a platform for managing customer conversations across multiple channels such as WhatsApp,
          Instagram, Facebook Messenger, Telegram, and Google Maps reviews. This policy explains how we collect,
          use, and protect data when you use the platform.
        </p>

        <h2>Data we collect</h2>
        <ul>
          <li>Account data such as name, email, job role, and company information.</li>
          <li>Connection data authorized by the customer, such as page IDs, account handles, WhatsApp numbers, and the access tokens needed to operate the service.</li>
          <li>Conversation, message, comment, and review data that reaches the customer's account after their approval.</li>
          <li>Operational data such as the assigned employee, tags, templates, automations, and usage history within the platform.</li>
        </ul>

        <h2>How we use data</h2>
        <p>
          We use data to provide the conversation management service, receive messages, comments, and reviews,
          assign conversations to employees, send replies, run templates and automations, and display reports for
          the customer's account.
        </p>

        <h2>Meta Platform data</h2>
        <p>
          We use Meta Platform data solely to provide messaging and customer-service features on behalf of the
          customer who granted authorization. We do not sell Meta data, do not use it for advertising purposes
          unrelated to the service, and do not share it with third parties except where necessary to provide the
          service or comply with regulations.
        </p>

        <h2>Data protection</h2>
        <p>
          We apply appropriate measures to protect data and restrict access according to permissions within the
          account. Each customer retains control over their connection, employee, and permission settings.
        </p>

        <h2>Data retention and deletion</h2>
        <p>
          We retain data for as long as necessary to operate the service or as required by law. A customer may
          request deletion of their data or disconnect channels from the platform settings or via the data
          deletion page.
        </p>

        <h2>Contact</h2>
        <div className="legal-contact">
          <p>For privacy inquiries, contact us at: marketing@audience.sa</p>
        </div>

        <nav className="legal-links">
          <Link href="/en/terms">Terms of use</Link>
          <Link href="/en/data-deletion">Data deletion</Link>
          <Link href="/en">Home</Link>
          <Link href="/privacy">العربية</Link>
        </nav>
      </section>
    </main>
  );
}
