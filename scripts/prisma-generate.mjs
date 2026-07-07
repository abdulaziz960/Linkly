import { spawnSync } from "node:child_process";
import { writePrismaSchema } from "./prisma-schema.mjs";

const { provider, schemaPath } = writePrismaSchema();
console.log(`Prisma schema provider: ${provider}`);

const result = spawnSync("npx", ["prisma", "generate", "--schema", schemaPath], {
  stdio: "inherit",
  shell: process.platform === "win32"
});

process.exit(result.status ?? 1);
