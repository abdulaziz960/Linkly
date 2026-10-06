import type { Metadata } from "next";
import { applyPageSeo } from "../../../lib/page-seo";
import Link from "next/link";
import HtmlLangSync from "../../HtmlLangSync";
import CookieSettingsLink from "../../CookieSettingsLink";
import "../../legal.css";

const baseMetadata: Metadata = {
  title: { absolute: "Privacy Policy | Linkly" },
  description: "How Linkly collects, uses, and protects customer and account data across connected channels like WhatsApp, Instagram, and email.",
  alternates: { canonical: "/en/privacy", languages: { "ar-SA": "/privacy", en: "/en/privacy" } }
};

// Page SEO is editable from the admin panel, so the metadata is read on each request.
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return applyPageSeo("/en/privacy", baseMetadata);
}

export default function PrivacyPageEn() {
  return (
    <main className="legal-page" dir="ltr" lang="en">
      <HtmlLangSync lang="en" dir="ltr" />
      <section className="legal-shell">
        <Link className="legal-brand" href="/en">
          <span className="legal-logo" aria-hidden="true" />
          Linkly
        </Link>
        <h1>Privacy Policy</h1>
        <p className="legal-updated">Last updated: October 6, 2026</p>

        <p>
          Linkly is a platform for managing customer conversations across multiple channels such as WhatsApp,
          Instagram, Facebook Messenger, Telegram, email, X (Twitter), LinkedIn, Snapchat, YouTube, TikTok (pending
          platform approval), and Google Maps reviews. This policy explains how we collect, use, and protect data
          when you use the platform.
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
          service or comply with regulations. The same principle applies to data from any other channel you
          connect (X, LinkedIn, Snapchat, YouTube, TikTok, Telegram, or email): it is used solely to operate
          messaging and engagement features on your behalf, and is never sold or used for advertising unrelated to
          the service.
        </p>

        <h2>Google user data (Gmail, YouTube and Business Profile)</h2>
        <p>
          When a customer connects their Google account to Linkly, we request only the following permissions, with
          their explicit consent on Google&apos;s official consent screen:
        </p>
        <ul>
          <li>Gmail: read incoming messages (gmail.readonly) and send replies (gmail.send), to show email in the shared inbox and reply to it.</li>
          <li>YouTube: read comments on the customer&apos;s channel and reply to them (youtube.force-ssl).</li>
          <li>Google Business Profile: read reviews and reply to them (business.manage).</li>
        </ul>
        <p>
          We use this data only to display messages, comments and reviews inside the customer&apos;s account and to send
          the replies written by the customer or their authorized team members. We do not use it for any other purpose.
        </p>
        <h3>Who we share, transfer or disclose Google user data with</h3>
        <ul>
          <li>We do not sell Google user data, do not share it with data brokers or advertising networks, and do not use it for advertising or profiling.</li>
          <li>The data is visible only to the users of the same workspace whom the customer added, according to the permissions the customer granted them.</li>
          <li>We store and process it on Google Cloud infrastructure (Cloud Run and Cloud SQL in the me-central2 region) as a hosting provider acting on our behalf, which may not use the data for anything other than providing the service.</li>
          <li>If the customer turns on Linkly&apos;s AI features and uses them on a conversation that contains content from these channels, only the conversation text needed for that operation is sent to the AI provider the customer chose (Google Gemini, OpenAI, OpenRouter or DeepSeek) to carry out the request. The feature does not run on channel content unless the customer enables it.</li>
          <li>We do not disclose Google user data to any other party except with the customer&apos;s consent, where required by law or a court order, or for security and abuse prevention.</li>
        </ul>
        <h3>Limited Use</h3>
        <p>
          Linkly&apos;s use and transfer to any other app of information received from Google APIs will adhere to the Google
          API Services User Data Policy, including the Limited Use requirements. In addition: our staff do not read
          Google user data unless the customer consents, for security or technical troubleshooting, or to comply with
          law, and we do not use Google user data to train generalized AI models.
        </p>
        <h3>Retention and deletion</h3>
        <p>
          When a Google channel is disconnected from the platform settings we delete its access tokens, and the
          customer may request deletion of their data through the
          <Link href="/en/data-deletion"> data deletion page</Link>. They can also revoke access at any time at
          myaccount.google.com/permissions.
        </p>

        <h2>Data protection</h2>
        <p>
          We apply appropriate measures to protect data and restrict access according to permissions within the
          account. Each customer retains control over their connection, employee, and permission settings.
        </p>

        <h2>Cookies and analytics</h2>
        <p>
          Our marketing site uses analytics cookies (Google Analytics via Google Tag Manager) solely to understand
          and improve site usage - never for targeted advertising. These tools are never loaded and no analytics
          cookie is ever stored until you explicitly consent via the cookie notice shown on your first visit, and
          you can accept or withdraw that consent at any time.
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
          <CookieSettingsLink label="Cookie settings" />
          <Link href="/en">Home</Link>
          <Link href="/privacy">العربية</Link>
        </nav>
      </section>
    </main>
  );
}
