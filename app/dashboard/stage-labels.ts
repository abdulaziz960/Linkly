// Stage values are stored as-is ("فاز", "خسر"); only the label shown to people changes.
const DISPLAY_AR: Record<string, string> = { "فاز": "تم البيع", "خسر": "غير مهتم" };
const DISPLAY_EN: Record<string, string> = { "فاز": "Sold", "خسر": "Not interested" };

export function stageDisplayLabel(stage: string, lang: "ar" | "en") {
  return (lang === "en" ? DISPLAY_EN : DISPLAY_AR)[stage] ?? stage;
}
