import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Mirrors tsconfig.json's "@/*" -> "./*" path alias, which Vitest doesn't
// pick up on its own. Without this, any test that transitively imports a
// module using the "@/" alias (e.g. lib/email-inbox.ts) fails to resolve.
export default defineConfig({
  // Database suites each start a Prisma engine; bound parallelism on large
  // hosts, and give them more than the 5s default - under the full suite's
  // combined CPU/IO load, several genuinely-passing e2e-style tests
  // (campaign-link-tracking, conversation-rating, bot-conversation-status)
  // were timing out even though they pass individually in well under 5s.
  test: { include: ["tests/**/*.test.ts"], maxWorkers: 2, testTimeout: 20000, hookTimeout: 20000 },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url))
    }
  }
});
