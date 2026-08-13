import { spawnSync } from "node:child_process";
import { writePrismaSchema } from "./prisma-schema.mjs";

const { provider, schemaPath } = writePrismaSchema();
console.log(`Prisma schema provider: ${provider}`);

const isWindows = process.platform === "win32";
const result = isWindows
  ? spawnSync(`npx prisma generate --schema "${schemaPath}"`, { stdio: "inherit", shell: true })
  : spawnSync("npx", ["prisma", "generate", "--schema", schemaPath], { stdio: "inherit" });

process.exit(result.status ?? 1);
