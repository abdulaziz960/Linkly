"use client";
import { trackMarketingEvent } from "../../lib/marketing-metrics";

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
    genericError: "تعذر إنشاء الحساب",
    fixFields: "راجع الحقول المحددة بالأحمر",
    errCompany: "اكتب اسم النشاط التجاري",
    errBusinessType: "اختر نوع النشاط",
    errOwner: "اكتب اسمك الكامل",
    errEmail: "اكتب بريداً إلكترونياً صحيحاً مثل name@company.sa",
    errPhone: "اكتب رقم جوال سعودي صحيح، مثل 0501234567",
    phoneHint: "نقبل حالياً أرقام الجوال السعودية فقط (تبدأ بـ 05 أو 966)."
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
    genericError: "Couldn't create the account",
    fixFields: "Please fix the fields marked in red",
    errCompany: "Enter your business name",
    errBusinessType: "Choose your business type",
    errOwner: "Enter your full name",
    errEmail: "Enter a valid email such as name@company.sa",
    errPhone: "Enter a valid Saudi mobile number, such as 0501234567",
    phoneHint: "We currently accept Saudi mobile numbers only (starting with 05 or 966)."
  }
};

const PHONE_PATTERN = /^(00966|\+966|966|0)?5\d{8}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
type FieldName = "companyName" | "businessType" | "ownerName" | "ownerEmail" | "phone" | "terms";

export default function SignupForm({ lang = "ar", plans, defaultPlanId }: { lang?: "ar" | "en"; plans: { id: string; name: string }[]; defaultPlanId: string }) {
  const router = useRouter();
  const text = copy[lang];
  const businessTypeOptions = businessTypes[lang];
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [errors, setErrors] = useState<Partial<Record<FieldName, string>>>({});

  function check(name: FieldName, value: string): string {
    const trimmed = value.trim();
    if (name === "companyName") return trimmed ? "" : text.errCompany;
    if (name === "businessType") return trimmed ? "" : text.errBusinessType;
    if (name === "ownerName") return trimmed ? "" : text.errOwner;
    if (name === "ownerEmail") return EMAIL_PATTERN.test(trimmed) ? "" : text.errEmail;
    if (name === "phone") return PHONE_PATTERN.test(trimmed.replace(/[\s-]/g, "")) ? "" : text.errPhone;
    return "";
  }

  function validateOne(name: FieldName, value: string) {
    setErrors((current) => ({ ...current, [name]: check(name, value) }));
  }

  const describe = (name: FieldName, extra = "") => [errors[name] ? `signup-${name}-error` : "", extra].filter(Boolean).join(" ") || undefined;
  const fieldError = (name: FieldName) => (errors[name] ? <small className="field-error" id={`signup-${name}-error`}>{errors[name]}</small> : null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const next: Partial<Record<FieldName, string>> = {};
    for (const name of ["companyName", "businessType", "ownerName", "ownerEmail", "phone"] as const) {
      const message = check(name, String(form.get(name) ?? ""));
      if (message) next[name] = message;
    }
    if (!termsAccepted) next.terms = text.termsRequired;
    setErrors(next);
    const first = (["companyName", "businessType", "ownerName", "ownerEmail", "phone", "terms"] as const).find((name) => next[name]);
    if (first) {
      setError(text.fixFields);
      formElement.querySelector<HTMLElement>(first === "terms" ? ".signup-terms input" : first === "businessType" ? ".custom-select-trigger" : `[name="${first}"]`)?.focus();
      return;
    }
    setLoading(true); setError("");
    trackMarketingEvent("trial_form_submit");
    const response = await fetch("/api/trial", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
      companyName: form.get("companyName"), businessType: form.get("businessType"), ownerName: form.get("ownerName"), ownerEmail: form.get("ownerEmail"), phone: form.get("phone"), vatNumber: form.get("vatNumber"), website: form.get("website"), termsAccepted, planId: form.get("planId")
    }) });
    const payload = await response.json().catch(() => ({})) as {
      error?: string;
      message?: string;
      data?: { message?: string; activationUrl?: string; emailSent?: boolean };
    };
    setLoading(false);
    // The server's own messages are Arabic today: an English page shows a clear English line instead of them.
    if (!response.ok) {
      const serverMessage = payload.error || payload.message || "";
      return setError(lang === "en" && /[\u0600-\u06FF]/.test(serverMessage) ? "We couldn't create the account with these details. Please check them and try again." : serverMessage || text.genericError);
    }
    trackMarketingEvent("trial_created");
    if (payload.data?.activationUrl) return router.push(payload.data.activationUrl.replace(location.origin, ""));
    const delivery = payload.data?.emailSent === false ? "failed" : "sent";
    router.push(`/signup/success?email=${encodeURIComponent(String(form.get("ownerEmail") || ""))}&delivery=${delivery}${lang === "en" ? "&lang=en" : ""}`);
  }

  return <form className="journey-form" onSubmit={submit} noValidate>
    <label>{text.companyName}<input name="companyName" required maxLength={120} autoComplete="organization" placeholder={text.companyNamePlaceholder} aria-invalid={Boolean(errors.companyName)} aria-describedby={describe("companyName")} onBlur={(event) => validateOne("companyName", event.target.value)} />{fieldError("companyName")}</label>
    <label>{text.businessType}<CustomSelect name="businessType" defaultValue="" options={businessTypeOptions} onChange={(value) => validateOne("businessType", value)} />{fieldError("businessType")}</label>
    <label>{text.ownerName}<input name="ownerName" required maxLength={100} autoComplete="name" placeholder={text.ownerNamePlaceholder} aria-invalid={Boolean(errors.ownerName)} aria-describedby={describe("ownerName")} onBlur={(event) => validateOne("ownerName", event.target.value)} />{fieldError("ownerName")}</label>
    <label>{text.email}<input name="ownerEmail" type="email" required maxLength={254} autoComplete="email" placeholder="name@company.sa" aria-invalid={Boolean(errors.ownerEmail)} aria-describedby={describe("ownerEmail")} onBlur={(event) => validateOne("ownerEmail", event.target.value)} />{fieldError("ownerEmail")}</label>
    <label>{text.phone}<input name="phone" type="tel" required inputMode="tel" maxLength={30} autoComplete="tel" dir="ltr" placeholder={text.phonePlaceholder} aria-invalid={Boolean(errors.phone)} aria-describedby={describe("phone", "signup-phone-hint")} onBlur={(event) => validateOne("phone", event.target.value)} /><small className="field-hint" id="signup-phone-hint">{text.phoneHint}</small>{fieldError("phone")}</label>
    <label>{lang === "en" ? "VAT number (optional)" : "الرقم الضريبي للمنشأة (اختياري)"}<input name="vatNumber" dir="ltr" inputMode="numeric" maxLength={20} placeholder="3XXXXXXXXXXXXX3" /></label>
    <label className="signup-honeypot" aria-hidden="true">{text.website}<input name="website" tabIndex={-1} autoComplete="off" /></label>
    {plans.length ? <label>{text.plan}<CustomSelect name="planId" defaultValue={defaultPlanId} options={plans.map((plan) => ({ value: plan.id, label: plan.name }))} /></label> : null}
    <label className="signup-terms">
      <input type="checkbox" checked={termsAccepted} onChange={(event) => { setTermsAccepted(event.target.checked); setErrors((current) => ({ ...current, terms: event.target.checked ? "" : text.termsRequired })); }} aria-invalid={Boolean(errors.terms)} aria-describedby={describe("terms")} />
      <span>
        {text.termsPrefix} <Link href={lang === "en" ? "/en/terms" : "/terms"} target="_blank" rel="noopener noreferrer">{text.termsOf}</Link> {text.and} <Link href={lang === "en" ? "/en/privacy" : "/privacy"} target="_blank" rel="noopener noreferrer">{text.privacyOf}</Link>
      </span>
    </label>
    {errors.terms ? <small className="field-error" id="signup-terms-error">{errors.terms}</small> : null}
    {error ? <p className="journey-error" role="alert">{error}</p> : null}
    <button className="journey-submit" disabled={loading}>{loading ? text.submitting : text.submit}</button>
  </form>;
}
