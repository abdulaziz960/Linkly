import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Mirrors tsconfig.json's "@/*" -> "./*" path alias, which Vitest doesn't
// pick up on its own. Without this, any test that transitively imports a
// module using the "@/" alias (e.g. lib/email-inbox.ts) fails to resolve.
export default defineConfig({
  // Database suites each start a Prisma engine; bound parallelism on large hosts.
  test: { include: ["tests/**/*.test.ts"], maxWorkers: 2 },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url))
    }
  }
});
