import type { EmailIntegration, Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "./prisma";

type EmailIntegrationClient = PrismaClient | Prisma.TransactionClient;

/**
 * Canonical id of a tenant's email integration row. The Gmail OAuth flow
 * and the per-tenant default both use it. (The historical `primary-email`
 * row seeded for tenant-demo predates this convention.)
 */
export function emailIntegrationId(tenantId: string) {
  return `email:${tenantId}`;
}

/**
 * THE way to load a tenant's email integration. email_integrations.tenant_id
 * is meant to be unique (migration 20260828170000 adds the index), but a
 * database can briefly hold two rows for one tenant (tenant-demo had both
 * `primary-email` and `email:tenant-demo`). A plain findFirst then returns
 * whichever row PostgreSQL happens to read first - which changes after any
 * UPDATE - so Gmail sync/sending silently switched rows. Prefer the
 * canonical row, then the most recently updated one.
 */
export async function findTenantEmailIntegration(tenantId: string, client: EmailIntegrationClient = prisma): Promise<EmailIntegration | null> {
  const canonical = await client.emailIntegration.findUnique({ where: { id: emailIntegrationId(tenantId) } });
  if (canonical && canonical.tenantId === tenantId) return canonical;
  return client.emailIntegration.findFirst({ where: { tenantId }, orderBy: [{ updatedAt: "desc" }, { id: "asc" }] });
}

function isUniqueViolation(error: unknown) {
  return typeof error === "object" && error !== null && (error as { code?: unknown }).code === "P2002";
}

/**
 * The tenant's email integration, created on first use. Several requests can
 * arrive together on a tenant's first visit (the dashboard loads settings from
 * more than one place), and every one of them sees "no row yet". The unique
 * index on tenant_id lets exactly one create succeed; the others must not turn
 * that into a 500 - they read the row the winner made.
 */
export async function getOrCreateTenantEmailIntegration(tenantId: string, data: Prisma.EmailIntegrationUncheckedCreateInput): Promise<EmailIntegration> {
  const existing = await findTenantEmailIntegration(tenantId);
  if (existing) return existing;
  try {
    return await prisma.emailIntegration.create({ data });
  } catch (error) {
    if (isUniqueViolation(error)) {
      const raced = await findTenantEmailIntegration(tenantId);
      if (raced) return raced;
    }
    throw error;
  }
}
