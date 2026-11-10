// How Linkly's assistant speaks to a workspace's customers. Pure (no database), so the settings page can list the
// options too; the chosen one is stored per workspace by lib/ai-tone.ts.

export const AI_TONES = ["saudi_colloquial", "saudi_plain", "formal", "friendly_brief"] as const;
export type AiTone = (typeof AI_TONES)[number];

/** What the workspace has until its owner picks one: the Saudi colloquial voice the assistant always used. */
export const DEFAULT_AI_TONE: AiTone = "saudi_colloquial";

export function isAiTone(value: unknown): value is AiTone {
  return typeof value === "string" && (AI_TONES as readonly string[]).includes(value);
}

export const AI_TONE_LABELS: Record<AiTone, { ar: string; en: string; hintAr: string; hintEn: string }> = {
  saudi_colloquial: { ar: "سعودي عامي", en: "Saudi colloquial", hintAr: "هلا والله، أبشر، حياك الله", hintEn: "Warm Saudi dialect, like a real salesperson" },
  saudi_plain: { ar: "سعودي عادي (لهجة بيضاء)", en: "Plain Saudi (white dialect)", hintAr: "كلام واضح يفهمه الجميع بلمسة سعودية خفيفة", hintEn: "Clear everyday words with a light Saudi touch" },
  formal: { ar: "رسمي (فصحى مبسّطة)", en: "Formal (simple standard Arabic)", hintAr: "أهلًا وسهلًا بكم، يسعدنا خدمتكم", hintEn: "Polite and professional, no dialect or emojis" },
  friendly_brief: { ar: "ودّي ومختصر", en: "Friendly and brief", hintAr: "رسائل قصيرة جدًا وبسيطة", hintEn: "One or two short, personal sentences" }
};

/** The instruction given to the model for each tone (the model's own working language is English). */
export const AI_TONE_STYLE: Record<AiTone, string> = {
  saudi_colloquial: "Saudi / Gulf colloquial Arabic (عامية سعودية), like a real salesperson writing on WhatsApp - warm and natural, for example: هلا والله، أبشر، حياك الله، تشرفنا، إن شاء الله.",
  saudi_plain: "Plain, simple Arabic with a light Saudi white-dialect (لهجة بيضاء) touch that anyone in the Gulf understands: clear everyday words and only a few light Saudi expressions such as حياك الله or أبشر. No heavy slang.",
  formal: "Formal, polite Modern Standard Arabic (فصحى مبسّطة): respectful and professional, addressing the customer with courtesy such as أهلًا وسهلًا بكم، يسعدنا خدمتكم، حضرتك. No dialect, no slang and never any emoji (this overrides any emoji allowance below).",
  friendly_brief: "Warm, friendly and very brief Arabic with a light Saudi touch, like a quick personal WhatsApp message: one or two short sentences at most."
};

/** A fixed line the assistant sends itself (not written by the model): the formal tone gets the formal wording. */
export function toneLine<T>(tone: AiTone, casual: T, formal: T): T {
  return tone === "formal" ? formal : casual;
}
