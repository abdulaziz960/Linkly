// Client-safe text helpers for the options chosen on an order line (no server imports).

/** One chosen option as an order line records it. */
export type OptionDetail = { group: string; groupEn: string; name: string; nameEn: string; delta: number };

function price(amount: number): string {
  const rounded = Math.round(amount * 100) / 100;
  return rounded.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

/**
 * Pure: the options as readable lines, one per group: "الحجم: كبير" and "الإضافات: جبن (+3 ر.س)، صوص". `lang` picks the English
 * names when they were given; the currency follows the language.
 */
export function optionLines(details: OptionDetail[], lang: "ar" | "en" = "ar"): string[] {
  const groups = new Map<string, string[]>();
  for (const detail of details) {
    const group = lang === "en" && detail.groupEn ? detail.groupEn : detail.group;
    const name = lang === "en" && detail.nameEn ? detail.nameEn : detail.name;
    const extra = detail.delta > 0 ? ` (+${price(detail.delta)}${lang === "en" ? " SAR" : " ر.س"})` : "";
    groups.set(group, [...(groups.get(group) ?? []), `${name}${extra}`]);
  }
  return [...groups.entries()].map(([group, names]) => `${group}: ${names.join(lang === "en" ? ", " : "، ")}`);
}
