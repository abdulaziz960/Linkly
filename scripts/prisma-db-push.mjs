import { spawnSync } from "node:child_process";
import { writePrismaSchema } from "./prisma-schema.mjs";

const { provider, schemaPath } = writePrismaSchema();

if (provider !== "postgresql") {
  console.log(`Skipping Prisma db push for ${provider} database`);
  process.exit(0);
}

if (process.env.VERCEL) {
  console.log("Skipping Prisma db push during Vercel build");
  process.exit(0);
}

console.log(`Pushing Prisma schema to ${provider} database`);

const result = spawnSync("npx", ["prisma", "db", "push", "--schema", schemaPath], {
  stdio: "inherit",
  shell: process.platform === "win32"
});

process.exit(result.status ?? 1);
