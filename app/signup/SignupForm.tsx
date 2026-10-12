"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import CustomSelect from "../components/CustomSelect";

const businessTypes = {
  ar: [
    { value: "", label: "اختر نوع النشاط" },
    { value: "real_estate", label: "عقار وتطوير عقاري" },
    { value: "retail", label: "متاجر وتجزئة" },
    { value: "ecommerce", label: "متجر إلكتروني" },
    { value: "restaurant", label: "مطاعم ومقاهي" },
    { value: "healthcare", label: "عيادات وصحة" },
    { value: "beauty", label: "صالونات وتجميل" },
    { value: "education", label: "تعليم وتدريب" },
    { value: "automotive", label: "سيارات وخدماتها" },
    { value: "travel", label: "سفر وسياحة" },
    { value: "professional_services", label: "خدمات مهنية" },
    { value: "other", label: "نشاط آخر" }
  ],
  en: [
    { value: "", label: "Choose business type" },
    { value: "real_estate", label: "Real estate and property development" },
    { value: "retail", label: "Retail" },
    { value: "ecommerce", label: "E-commerce" },
    { value: "restaurant", label: "Restaurants and cafes" },
    { value: "healthcare", label: "Clinics and healthcare" },
    { value: "beauty", label: "Beauty and salons" },
    { value: "education", label: "Education and training" },
    { value: "automotive", label: "Automotive" },
    { value: "travel", label: "Travel and tourism" },
    { value: "professional_services", label: "Professional services" },
    { value: "other", label: "Other business" }
  ]
};

const copy = {
  ar: {
    companyName: "اسم النشاط التجاري",
    companyNamePlaceholder: "مثال: شركة سما",
    businessType: "نوع النشاط",
    ownerName: "اسمك",
    ownerNamePlaceholder: "الاسم الكامل",
    email: "البريد الإلكتروني",
    website: "الموقع الإلكتروني",
    plan: "الباقة التي تريد تجربتها",
    phone: "رقم الجوال",
    phonePlaceholder: "05xxxxxxxx",
    termsPrefix: "أوافق على",
    termsOf: "شروط الاستخدام",
    and: "و",
    privacyOf: "سياسة الخصوصية",
    termsRequired: "يجب الموافقة على شروط الاستخدام وسياسة الخصوصية",
    submitting: "جاري تجهيز مساحتك...",
    submit: "ابدأ تجربتي مجانًا",
    genericError: "تعذر إنشاء الحساب"
  },
  en: {
    companyName: "Business name",
    companyNamePlaceholder: "e.g. Sama Company",
    businessType: "Business type",
    ownerName: "Your name",
    ownerNamePlaceholder: "Full name",
    email: "Email",
    website: "Website",
    plan: "Plan you want to try",
    phone: "Phone number",
    phonePlaceholder: "05xxxxxxxx",
    termsPrefix: "I agree to the",
    termsOf: "Terms of Service",
    and: "and",
    privacyOf: "Privacy Policy",
    termsRequired: "You must agree to the Terms of Service and Privacy Policy",
    submitting: "Setting up your workspace...",
    submit: "Start my free trial",
    genericError: "Couldn't create the account"
  }
};

export default function SignupForm({ lang = "ar", plans, defaultPlanId }: { lang?: "ar" | "en"; plans: { id: string; name: string }[]; defaultPlanId: string }) {
  const router = useRouter();
  const text = copy[lang];
  const businessTypeOptions = businessTypes[lang];
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!termsAccepted) return setError(text.termsRequired);
    const form = new FormData(event.currentTarget);
    if (!form.get("businessType")) return setError(lang === "en" ? "Choose your business type." : "اختر نوع النشاط.");
    setLoading(true); setError("");
    const response = await fetch("/api/trial", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
      companyName: form.get("companyName"), businessType: form.get("businessType"), ownerName: form.get("ownerName"), ownerEmail: form.get("ownerEmail"), phone: form.get("phone"), website: form.get("website"), termsAccepted, planId: form.get("planId")
    }) });
    const payload = await response.json().catch(() => ({})) as {
      error?: string;
      message?: string;
      data?: { message?: string; activationUrl?: string; emailSent?: boolean };
    };
    setLoading(false);
    // The backend only returns Arabic error messages today, so an
    // English-language signup still shows an Arabic error string here.
    if (!response.ok) return setError(payload.error || payload.message || text.genericError);
    if (payload.data?.activationUrl) return router.push(payload.data.activationUrl.replace(location.origin, ""));
    const delivery = payload.data?.emailSent === false ? "failed" : "sent";
    router.push(`/signup/success?email=${encodeURIComponent(String(form.get("ownerEmail") || ""))}&delivery=${delivery}${lang === "en" ? "&lang=en" : ""}`);
  }

  return <form className="journey-form" onSubmit={submit}>
    <label>{text.companyName}<input name="companyName" required maxLength={120} autoComplete="organization" placeholder={text.companyNamePlaceholder} /></label>
    <label>{text.businessType}<CustomSelect name="businessType" defaultValue="" options={businessTypeOptions} /></label>
    <label>{text.ownerName}<input name="ownerName" required maxLength={100} autoComplete="name" placeholder={text.ownerNamePlaceholder} /></label>
    <label>{text.email}<input name="ownerEmail" type="email" required maxLength={254} autoComplete="email" placeholder="name@company.sa" /></label>
    <label>{text.phone}<input name="phone" type="tel" required inputMode="tel" maxLength={30} autoComplete="tel" pattern="^(00966|\+966|966|0)?5\d{8}$" title={text.phonePlaceholder} placeholder={text.phonePlaceholder} /></label>
    <label className="signup-honeypot" aria-hidden="true">{text.website}<input name="website" tabIndex={-1} autoComplete="off" /></label>
    {plans.length ? <label>{text.plan}<CustomSelect name="planId" defaultValue={defaultPlanId} options={plans.map((plan) => ({ value: plan.id, label: plan.name }))} /></label> : null}
    <label className="signup-terms">
      <input type="checkbox" checked={termsAccepted} onChange={(event) => setTermsAccepted(event.target.checked)} required />
      <span>
        {text.termsPrefix} <Link href={lang === "en" ? "/en/terms" : "/terms"} target="_blank" rel="noopener noreferrer">{text.termsOf}</Link> {text.and} <Link href={lang === "en" ? "/en/privacy" : "/privacy"} target="_blank" rel="noopener noreferrer">{text.privacyOf}</Link>
      </span>
    </label>
    {error ? <p className="journey-error" role="alert">{error}</p> : null}
    <button className="journey-submit" disabled={loading || !termsAccepted}>{loading ? text.submitting : text.submit}</button>
  </form>;
}
