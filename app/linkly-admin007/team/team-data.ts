import type { TeamRow } from "../types";

export function filterTeam(team: TeamRow[], query: string) {
  const needle = query.trim().toLowerCase();
  if (!needle) return team;
  return team.filter((member) => member.name.toLowerCase().includes(needle) || member.email.toLowerCase().includes(needle));
}

/** Oldest/newest member by createdAt; null for both unless there are at least two members. */
export function teamExtremes(team: TeamRow[]) {
  if (team.length < 2) return { oldest: null, newest: null };
  const sorted = [...team].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return { oldest: sorted[0], newest: sorted[sorted.length - 1] };
}

export function validateInvite(name: string, email: string, existing: TeamRow[]): string | null {
  if (!name.trim()) return "اسم العضو مطلوب.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return "أدخل بريدًا إلكترونيًا صحيحًا.";
  if (existing.some((member) => member.email.toLowerCase() === email.trim().toLowerCase())) return "هذا البريد مضاف بالفعل إلى الفريق.";
  return null;
}
