/**
 * Lead-form answers (Meta Lead Ads, Snapchat Lead Gen, a Zapier body...) as readable text.
 * Pure helpers shared by every channel that receives forms, so the conversation always shows
 * the same thing: a title, then "label: answer" per answered question.
 */

export type FormAnswer = { question: string; answer: string };

const QUESTION_LABELS: Record<string, string> = {
  FULL_NAME: "الاسم",
  NAME: "الاسم",
  FIRST_NAME: "الاسم الأول",
  LAST_NAME: "اسم العائلة",
  PHONE_NUMBER: "رقم الجوال",
  PHONE: "رقم الجوال",
  MOBILE: "رقم الجوال",
  WHATSAPP_NUMBER: "رقم واتساب",
  EMAIL: "البريد الإلكتروني",
  BUDGET: "الميزانية",
  PURCHASE_PURPOSE: "الغرض من الشراء",
  PURCHASE_METHOD: "طريقة الشراء",
  PREFERRED_CONTACT_TIME: "وقت التواصل المفضل",
  PROPERTY_TYPE: "نوع العقار",
  PROJECT: "المشروع",
  PROJECT_NAME: "المشروع",
  CITY: "المدينة",
  STATE: "المنطقة",
  COUNTRY: "الدولة",
  ZIP_CODE: "الرمز البريدي",
  POSTAL_CODE: "الرمز البريدي",
  GENDER: "الجنس",
  DATE_OF_BIRTH: "تاريخ الميلاد",
  AGE: "العمر",
  COMPANY_NAME: "الشركة",
  JOB_TITLE: "المسمى الوظيفي"
};

/** "full_name" / "FULL_NAME" -> "الاسم"; a custom question keeps its own wording (underscores read as spaces). */
export function questionLabel(question: string): string {
  const key = question.trim().toUpperCase().replace(/[\s-]+/g, "_");
  return QUESTION_LABELS[key] ?? question.replace(/_/g, " ").trim();
}

/** The form as readable lines: a title, then "• label: answer" per question. An unanswered one shows "—". */
export function summarizeFormAnswers(title: string, answers: FormAnswer[]): string {
  const lines = [`📋 ${title}`];
  for (const answer of answers) {
    const value = (answer.answer || "").trim();
    if (!answer.question && !value) continue;
    lines.push(`• ${questionLabel(answer.question || "")}: ${value || "—"}`);
  }
  return lines.join("\n");
}

/** First non-empty answer whose question is one of `keys` (compared case-insensitively). */
export function pickAnswer(answers: FormAnswer[], keys: string[]): string {
  const wanted = keys.map((key) => key.toUpperCase());
  const match = answers.find((answer) => wanted.includes(answer.question.trim().toUpperCase().replace(/[\s-]+/g, "_")) && answer.answer.trim());
  return match?.answer.trim() ?? "";
}

const API_KNOWN_KEYS = new Set(["customerphone", "phone_number", "phone", "mobile", "customername", "full_name", "name", "text", "visit", "visitat"]);

/** The extra scalar fields of a request body (everything that is not a known lead field), capped and trimmed. */
export function extraAnswersFromBody(body: Record<string, unknown>): FormAnswer[] {
  const answers: FormAnswer[] = [];
  for (const [key, value] of Object.entries(body)) {
    if (answers.length >= 20) break;
    if (API_KNOWN_KEYS.has(key.toLowerCase())) continue;
    if (!/^[\p{L}\p{N}_.\- ]{1,60}$/u.test(key)) continue;
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      const text = String(value).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").trim().slice(0, 300);
      if (text) answers.push({ question: key, answer: text });
    }
  }
  return answers;
}
