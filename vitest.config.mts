import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Mirrors tsconfig.json's "@/*" -> "./*" path alias, which Vitest doesn't
// pick up on its own. Without this, any test that transitively imports a
// module using the "@/" alias (e.g. lib/email-inbox.ts) fails to resolve.
export default defineConfig({
  // Most suites swap DATABASE_URL before importing the singleton Prisma
  // client. Running database files concurrently can race schema bootstraps
  // and leak process-wide environment state between suites, so keep files
  // serial while still allowing concurrency inside a suite when requested.
  test: { include: ["tests/**/*.test.ts"], fileParallelism: false, testTimeout: 30000, hookTimeout: 30000 },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url))
    }
  }
});
