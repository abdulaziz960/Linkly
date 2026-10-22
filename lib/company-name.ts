/**
 * The workspace's company name (Subscription.companyName): shown in the admin client pages, search,
 * alerts, the workspace switcher and the delete-account confirmation. The account owner edits it from
 * the profile window; the platform team from the client page.
 */
export const COMPANY_NAME_MIN = 2;
export const COMPANY_NAME_MAX = 80;

/** The cleaned name, or an Arabic error message. Pure (safe in client components). */
export function normalizeCompanyName(value: unknown): { name: string } | { error: string } {
  const name = String(value ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (name.length < COMPANY_NAME_MIN) return { error: "اكتب اسم الشركة (حرفان على الأقل)" };
  if (name.length > COMPANY_NAME_MAX) return { error: `اسم الشركة أطول من ${COMPANY_NAME_MAX} حرفًا` };
  return { name };
}
