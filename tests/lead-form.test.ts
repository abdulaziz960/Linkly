import { describe, expect, it } from "vitest";
import { extraAnswersFromBody, pickAnswer, questionLabel, summarizeFormAnswers } from "../lib/lead-form";

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
