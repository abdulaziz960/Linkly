import { prisma } from "./prisma";

// Additive, idempotent DDL: a NEW table (one row per UTC day), no ALTER.
export const EMAIL_USAGE_SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS email_usage_days (
    day TEXT PRIMARY KEY,
    sent INTEGER NOT NULL DEFAULT 0
  )`
];

export async function ensureEmailUsageSchema() {
  for (const statement of EMAIL_USAGE_SCHEMA_STATEMENTS) {
    try {
      await prisma.$executeRawUnsafe(statement);
    } catch (error) {
      console.error("[schema] email_usage_days migration failed", error);
    }
  }
}
