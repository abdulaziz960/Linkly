import { prisma } from "./prisma";
import { ensureSchema } from "./database";
import { isInlineDataUrl } from "./message-attachments";

/**
 * Where a client logo comes from in the admin panel: the workspace brand logo
 * first, then the account owner profile picture. The list pages only ask WHICH
 * clients have one (the big data-URL column is never selected for that), and the
 * image itself is served by app/api/admin/clients/[id]/logo/route.ts.
 */
export async function getClientLogoTenantIds(): Promise<string[]> {
  try {
    await ensureSchema();
    const [brand, owners] = await Promise.all([
      prisma.tenantPreference.findMany({ where: { brandLogoDataUrl: { not: "" } }, select: { tenantId: true } }),
      prisma.userAccount.findMany({ where: { role: "مالك الحساب", profileLogo: { not: "" } }, select: { tenantId: true } })
    ]);
    return Array.from(new Set([...brand, ...owners].map((row) => row.tenantId)));
  } catch (error) {
    console.error("[admin-client-logos] could not list client logos, falling back to initials", error);
    return [];
  }
}

export async function getClientLogoDataUrl(tenantId: string): Promise<string | null> {
  await ensureSchema();
  const preference = await prisma.tenantPreference.findUnique({ where: { tenantId }, select: { brandLogoDataUrl: true } });
  if (isInlineDataUrl(preference?.brandLogoDataUrl)) return preference.brandLogoDataUrl;

  const owner = await prisma.userAccount.findFirst({
    where: { tenantId, role: "مالك الحساب", profileLogo: { not: "" } },
    orderBy: { createdAt: "asc" },
    select: { profileLogo: true }
  });
  return isInlineDataUrl(owner?.profileLogo) ? owner.profileLogo : null;
}
