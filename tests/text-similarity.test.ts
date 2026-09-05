import { describe, expect, it } from "vitest";
import { normalizeArabicText, textSimilarity, SIMILARITY_CLUSTER_THRESHOLD } from "../lib/text-similarity";

describe("normalizeArabicText", () => {
  it("strips diacritics and tatweel", () => {
    expect(normalizeArabicText("شُكْراً جَزيلاً")).toBe(normalizeArabicText("شكرا جزيلا"));
    expect(normalizeArabicText("مرحبـــا")).toBe(normalizeArabicText("مرحبا"));
  });

  it("unifies alef and alef-maksura variants", () => {
    expect(normalizeArabicText("أهلاً")).toBe(normalizeArabicText("اهلا"));
    expect(normalizeArabicText("إلى متى")).toBe(normalizeArabicText("الى متي"));
    expect(normalizeArabicText("على")).toBe(normalizeArabicText("علي"));
  });

  it("collapses whitespace and punctuation", () => {
    expect(normalizeArabicText("  مرحبا،   كيف حالك؟  ")).toBe("مرحبا كيف حالك");
  });
});

describe("textSimilarity", () => {
  it("scores a near-duplicate rewording well above the cluster threshold", () => {
    const a = "شكراً جزيلاً على تواصلكم معنا، نتشرف بخدمتكم دائماً";
    const b = "شكرا كثير على تواصلكم معنا، نتشرف بخدمتكم دائما";
    expect(textSimilarity(a, b)).toBeGreaterThan(SIMILARITY_CLUSTER_THRESHOLD + 0.2);
  });

  it("scores a differently-worded but same-meaning reply above the cluster threshold", () => {
    const a = "تم استلام طلبكم وسيتم التواصل معكم خلال 24 ساعة";
    const b = "استلمنا طلبكم وبنتواصل معاكم خلال يوم واحد";
    expect(textSimilarity(a, b)).toBeGreaterThan(SIMILARITY_CLUSTER_THRESHOLD);
  });

  it("scores unrelated replies well below the cluster threshold", () => {
    const a = "شكراً جزيلاً على تواصلكم معنا، نتشرف بخدمتكم دائماً";
    const b = "السعر يبدأ من 500 ريال شامل الضريبة";
    expect(textSimilarity(a, b)).toBeLessThan(SIMILARITY_CLUSTER_THRESHOLD - 0.1);

    const c = "يعطيكم العافية على تواصلكم، نقدر لكم ثقتكم فينا";
    const d = "تم استلام طلبكم وسيتم التواصل معكم خلال 24 ساعة";
    expect(textSimilarity(c, d)).toBeLessThan(SIMILARITY_CLUSTER_THRESHOLD - 0.1);
  });

  it("returns 0 for empty or whitespace-only input", () => {
    expect(textSimilarity("", "شكرا")).toBe(0);
    expect(textSimilarity("   ", "شكرا")).toBe(0);
  });

  it("is symmetric", () => {
    const a = "مرحباً بك، كيف يمكنني مساعدتك اليوم؟";
    const b = "أهلاً وسهلاً، كيف أقدر أساعدك؟";
    expect(textSimilarity(a, b)).toBeCloseTo(textSimilarity(b, a), 10);
  });
});
