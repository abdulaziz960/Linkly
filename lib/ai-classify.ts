/** Maps a model answer back onto one of the workspace's own tag names; anything else (or NONE) yields null. */
export function matchTagLabel(answer: string | null | undefined, labels: string[]): string | null {
  const text = (answer || "").trim().replace(/^["'«`]+|["'»`.]+$/g, "").trim().toLowerCase();
  if (!text || text === "none") return null;
  return labels.find((label) => label.trim().toLowerCase() === text) ?? null;
}
