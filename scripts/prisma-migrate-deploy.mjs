import { spawnSync } from "node:child_process";
import { writePrismaSchema } from "./prisma-schema.mjs";

const { provider, schemaPath } = writePrismaSchema();

if (provider !== "postgresql") {
  console.error(`Production migrations require PostgreSQL; received ${provider}`);
  process.exit(1);
}

const isWindows = process.platform === "win32";
const result = isWindows
  ? spawnSync(`npx prisma migrate deploy --schema "${schemaPath}"`, { stdio: "inherit", shell: true })
  : spawnSync("npx", ["prisma", "migrate", "deploy", "--schema", schemaPath], { stdio: "inherit" });

process.exit(result.status ?? 1);
