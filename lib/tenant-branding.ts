import { prisma } from "./prisma";
import { ensureSchema } from "./database";

export const DEFAULT_BRANDING = {
  name: "Linkly",
  logoDataUrl: "/assets/linkly-logo.png",
  color: "#178a82"
};

export type TenantBranding = typeof DEFAULT_BRANDING;

export const MAX_BRAND_LOGO_BYTES = 500 * 1024;

export async function getTenantBranding(tenantId: string): Promise<TenantBranding> {
  await ensureSchema();
  const preference = await prisma.tenantPreference.findUnique({ where: { tenantId } });

  return {
    name: preference?.brandName || DEFAULT_BRANDING.name,
    logoDataUrl: preference?.brandLogoDataUrl || DEFAULT_BRANDING.logoDataUrl,
    color: preference?.brandColor || DEFAULT_BRANDING.color
  };
}

export async function updateTenantBranding(tenantId: string, input: { name: string; logoDataUrl: string; color: string }): Promise<TenantBranding> {
  await ensureSchema();
  const preference = await prisma.tenantPreference.upsert({
    where: { tenantId },
    update: {
      brandName: input.name,
      brandLogoDataUrl: input.logoDataUrl,
      brandColor: input.color,
      updatedAt: new Date().toISOString()
    },
    create: {
      tenantId,
      brandName: input.name,
      brandLogoDataUrl: input.logoDataUrl,
      brandColor: input.color,
      updatedAt: new Date().toISOString()
    }
  });

  return {
    name: preference.brandName || DEFAULT_BRANDING.name,
    logoDataUrl: preference.brandLogoDataUrl || DEFAULT_BRANDING.logoDataUrl,
    color: preference.brandColor || DEFAULT_BRANDING.color
  };
}
