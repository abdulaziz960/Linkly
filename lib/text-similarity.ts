/**
 * Local, dependency-free approximate text similarity - no external
 * embeddings API. Character-trigram cosine similarity is robust to word
 * reordering and minor spelling/dialect variation without needing a
 * stemmer, which is enough to cluster differently-worded Arabic phrasings
 * of the same reply without a real semantic model.
 */

// Harakat/tanwin (U+064B-U+065F), superscript alef (U+0670), tatweel (U+0640).
const ARABIC_DIACRITICS = /[ً-ٰٟـ]/g;
// Alef variants (hamza-above/below, madda) collapsed to bare alef; alef
// maksura collapsed to ya - both common orthographic variation, not meaning.
const ALEF_VARIANTS = /[أإآ]/g;
const ALEF_MAKSURA = /ى/g;

export function normalizeArabicText(value: string): string {
  return value
    .replace(ARABIC_DIACRITICS, "")
    .replace(ALEF_VARIANTS, "ا")
    .replace(ALEF_MAKSURA, "ي")
    .toLocaleLowerCase("en-US")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function charTrigramCounts(text: string): Map<string, number> {
  const normalized = normalizeArabicText(text);
  const counts = new Map<string, number>();
  if (normalized.length < 3) {
    if (normalized.length > 0) counts.set(normalized, 1);
    return counts;
  }

  for (let i = 0; i <= normalized.length - 3; i++) {
    const gram = normalized.slice(i, i + 3);
    counts.set(gram, (counts.get(gram) || 0) + 1);
  }
  return counts;
}

export function textSimilarity(a: string, b: string): number {
  const gramsA = charTrigramCounts(a);
  const gramsB = charTrigramCounts(b);
  if (!gramsA.size || !gramsB.size) return 0;

  let dotProduct = 0;
  for (const [gram, countA] of gramsA) {
    const countB = gramsB.get(gram);
    if (countB) dotProduct += countA * countB;
  }
  if (!dotProduct) return 0;

  const magnitudeA = Math.sqrt(Array.from(gramsA.values()).reduce((sum, count) => sum + count * count, 0));
  const magnitudeB = Math.sqrt(Array.from(gramsB.values()).reduce((sum, count) => sum + count * count, 0));
  return dotProduct / (magnitudeA * magnitudeB);
}

// Picked and validated against representative near-duplicate/unrelated
// Arabic phrase pairs in tests/text-similarity.test.ts - measured scores for
// genuinely unrelated phrases topped out around 0.26, while differently
// worded phrasings of the same reply scored 0.49 and up, so 0.4 sits in the
// gap with margin on both sides. Character-trigram similarity is a local
// heuristic, not true semantic matching - it catches reworded/misspelled
// variants that still share a lot of characters, not free paraphrases that
// swap out most of the vocabulary (e.g. a greeting using entirely different
// words scored only ~0.17 and will not cluster).
export const SIMILARITY_CLUSTER_THRESHOLD = 0.4;
