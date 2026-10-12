import { describe, expect, it } from "vitest";
import { extraAnswersFromBody, pickAnswer, platformFromLeadSource, questionLabel, summarizeFormAnswers } from "../lib/lead-form";

describe("platform named in a lead's source field", () => {
  it("recognises the ad platforms in Arabic and English", () => {
    for (const value of ["TikTok", "tik tok", "تيك توك", "تيكتوك"]) expect(platformFromLeadSource(value)).toBe("tiktok");
    for (const value of ["Google Ads", "قوقل", "جوجل", "YouTube"]) expect(platformFromLeadSource(value)).toBe("google");
    for (const value of ["Snapchat", "سناب شات"]) expect(platformFromLeadSource(value)).toBe("snapchat");
    for (const value of ["Meta", "Facebook", "Instagram", "ميتا", "فيسبوك", "انستقرام"]) expect(platformFromLeadSource(value)).toBe("meta");
    expect(platformFromLeadSource("Typeform")).toBeNull();
    expect(platformFromLeadSource("")).toBeNull();
    expect(platformFromLeadSource(null)).toBeNull();
  });
});

describe("lead form answers", () => {
  it("labels the real-estate form fields in Arabic", () => {
    expect(questionLabel("full_name")).toBe("الاسم");
    expect(questionLabel("phone_number")).toBe("رقم الجوال");
    expect(questionLabel("email")).toBe("البريد الإلكتروني");
    expect(questionLabel("budget")).toBe("الميزانية");
    expect(questionLabel("purchase_purpose")).toBe("الغرض من الشراء");
    expect(questionLabel("purchase_method")).toBe("طريقة الشراء");
    expect(questionLabel("preferred_contact_time")).toBe("وقت التواصل المفضل");
    expect(questionLabel("favorite_color")).toBe("favorite color");
    expect(questionLabel("ميزانيتك")).toBe("ميزانيتك");
  });

  it("summarizes a form as readable lines", () => {
    expect(summarizeFormAnswers("بيانات النموذج", [
      { question: "full_name", answer: "محمد" },
      { question: "budget", answer: "1,200,000" },
      { question: "purchase_method", answer: "" }
    ])).toBe("📋 بيانات النموذج\n• الاسم: محمد\n• الميزانية: 1,200,000\n• طريقة الشراء: —");
  });

  it("picks an answer by any of its names", () => {
    const answers = [{ question: "Email", answer: " a@b.sa " }, { question: "phone_number", answer: "050" }];
    expect(pickAnswer(answers, ["EMAIL"])).toBe("a@b.sa");
    expect(pickAnswer(answers, ["MOBILE"])).toBe("");
  });

  it("collects the extra fields of a body, leaving the known lead fields out", () => {
    const extra = extraAnswersFromBody({
      phone_number: "0501234567", full_name: "محمد", customerPhone: "x", text: "t", visit: true,
      email: "m@x.sa", budget: 900000, purchase_purpose: "سكن", empty: "  ", nested: { a: 1 }, list: [1, 2], "bad<key>": "x"
    });
    expect(extra).toEqual([
      { question: "email", answer: "m@x.sa" },
      { question: "budget", answer: "900000" },
      { question: "purchase_purpose", answer: "سكن" }
    ]);
  });
});
