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
