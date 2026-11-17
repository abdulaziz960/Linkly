import type { Metadata } from "next";
import LegalPageView from "../LegalPageView";
import { applyPageSeo } from "../../lib/page-seo";

const baseMetadata: Metadata = {
  title: "تواصل معنا",
  description: "تواصل مع فريق Linkly للمبيعات والدعم الفني وتجهيز قنوات واتساب وإنستغرام وفيسبوك وتيليجرام، واطلب عرضًا توضيحيًا أو ابدأ تجربتك المجانية.",
  alternates: { canonical: "/contact", languages: { "ar-SA": "/contact", en: "/en/contact", "x-default": "/contact" } }
};

// Page SEO is editable from the admin panel, so the metadata is read on each request.
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return applyPageSeo("/contact", baseMetadata);
}

export default function ContactPage() {
  return <LegalPageView slug="contact" lang="ar" />;
}
