import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import nextEnv from "@next/env";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const { loadEnvConfig } = nextEnv;
loadEnvConfig(root);
const sourceSchemaPath = join(root, "prisma", "schema.prisma");
const generatedSchemaPath = join(root, "prisma", ".generated", "schema.prisma");
const migrationsPath = join(root, "prisma", "migrations");
const generatedMigrationsPath = join(root, "prisma", ".generated", "migrations");

function providerForDatabaseUrl(databaseUrl = "") {
  if (databaseUrl.startsWith("postgres://") || databaseUrl.startsWith("postgresql://")) return "postgresql";
  return "sqlite";
}

export function writePrismaSchema() {
  const provider = providerForDatabaseUrl(process.env.DATABASE_URL);
  const source = readFileSync(sourceSchemaPath, "utf8");
  const schema = source.replace(/provider\s+=\s+"(sqlite|postgresql)"/, `provider = "${provider}"`);

  mkdirSync(dirname(generatedSchemaPath), { recursive: true });
  writeFileSync(generatedSchemaPath, schema);
  if (existsSync(migrationsPath)) {
    cpSync(migrationsPath, generatedMigrationsPath, { recursive: true, force: true });
  }

  return {
    provider,
    schemaPath: generatedSchemaPath
  };
}
