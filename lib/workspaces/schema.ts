import { prisma } from "../prisma";

// Workspaces ("projects") are an opt-in feature, so its tables are created on first use rather than in the shared
// Prisma schema: nothing in the existing tables changes, and an account that never enables the feature never touches them.
//
//  - workspace_groups:       one row per customer account that uses projects. `billing_tenant_id` is the original account,
//                            the one that holds the subscription, the payments and the shared message credit.
//  - workspace_projects:     one row per project. Every project is a full workspace of its own (its own tenant id), so
//                            its conversations, customers, tags, replies, automations, knowledge, catalog, branches,
//                            templates, campaigns, channels and reports are isolated from every other project by the same
//                            tenant id every query in the app already filters on.
//  - workspace_addons:       what the platform team switched on for an account from the admin panel: whether projects are enabled and how
//                            many extra projects were bought (each one adds EXTRA_PROJECT_PRICE_SAR to the subscription).
//  - workspace_assignments:  a conversation handed to an employee of ANOTHER project of the same account. The employee
//                            sees and works only that conversation; this row is the only thing that grants it.
let schemaPromise: Promise<void> | null = null;

export function ensureWorkspacesSchema(): Promise<void> {
  schemaPromise ??= (async () => {
    await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS workspace_groups (
      id TEXT PRIMARY KEY,
      billing_tenant_id TEXT NOT NULL,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL
    )`);
    await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS workspace_groups_billing_tenant_id_key ON workspace_groups(billing_tenant_id)`);
    await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS workspace_projects (
      id TEXT PRIMARY KEY,
      group_id TEXT NOT NULL,
      tenant_id TEXT NOT NULL,
      name TEXT NOT NULL,
      color TEXT NOT NULL DEFAULT '#178a82',
      position INTEGER NOT NULL DEFAULT 0,
      archived INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    )`);
    await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS workspace_projects_tenant_id_key ON workspace_projects(tenant_id)`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS workspace_projects_group_id_idx ON workspace_projects(group_id)`);
    await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS workspace_assignments (
      tenant_id TEXT NOT NULL,
      conversation_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      assignee_name TEXT NOT NULL DEFAULT '',
      assigned_by TEXT NOT NULL DEFAULT '',
      assigned_at TEXT NOT NULL,
      PRIMARY KEY (tenant_id, conversation_id)
    )`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS workspace_assignments_user_id_idx ON workspace_assignments(user_id)`);
    await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS workspace_addons (
      billing_tenant_id TEXT PRIMARY KEY,
      enabled INTEGER NOT NULL DEFAULT 0,
      extra_projects INTEGER NOT NULL DEFAULT 0,
      updated_by TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL
    )`);
  })().catch((error) => {
    schemaPromise = null;
    throw error;
  });
  return schemaPromise;
}
