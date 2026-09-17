import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Mirrors tsconfig.json's "@/*" -> "./*" path alias, which Vitest doesn't
// pick up on its own. Without this, any test that transitively imports a
// module using the "@/" alias (e.g. lib/email-inbox.ts) fails to resolve.
export default defineConfig({
  // Database suites mutate process-wide environment variables and share the
  // Prisma singleton, so running files in parallel causes cross-suite
  // database races and intermittent timeouts.
  test: { include: ["tests/**/*.test.ts"], maxWorkers: 1 },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url))
    }
  }
});
