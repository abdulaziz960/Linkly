import { afterEach, describe, expect, it, vi } from "vitest";

// lib/prisma.ts must refuse to boot the app outside production against the
// production database reached through the local Cloud SQL proxy or its
// public IP. It throws at module load, before any connection is attempted.
describe("production database guard", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  const refused = [
    "postgresql://linkly_app:secret@127.0.0.1:6543/linkly",
    "postgresql://linkly_app:secret@localhost:6543/linkly",
    "postgres://linkly_app:secret@35.252.45.183:5432/linkly?sslmode=require",
    "postgresql://linkly_app:secret@localhost/linkly?host=/cloudsql/linkly-prod:me-central2:linkly-pg"
  ];

  for (const url of refused) {
    it(`refuses ${url.replace(/:secret@/, ":***@")}`, async () => {
      vi.stubEnv("NODE_ENV", "development");
      vi.stubEnv("DATABASE_URL", url);
      vi.resetModules();
      await expect(import("../lib/prisma")).rejects.toThrow(/Refusing to start against the production database/);
    });
  }

  it("honours a custom proxy port", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("DB_PROXY_PORT", "7654");
    vi.stubEnv("DATABASE_URL", "postgresql://u:p@127.0.0.1:7654/linkly");
    vi.resetModules();
    await expect(import("../lib/prisma")).rejects.toThrow(/Refusing/);
  });

  it("refuses a .env.db URL on a custom port even when DB_PROXY_PORT is not set for the app", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("DB_PROXY_PORT", "");
    vi.stubEnv("DATABASE_URL", "postgresql://someone:p@127.0.0.1:7654/whatever?application_name=linkly-db-scripts");
    vi.resetModules();
    await expect(import("../lib/prisma")).rejects.toThrow(/Refusing/);
  });

  it("refuses production credentials through a tunnel on any local port", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("DB_PROXY_PORT", "");
    vi.stubEnv("DATABASE_URL", "postgresql://linkly_app:p@localhost:7654/linkly");
    vi.resetModules();
    await expect(import("../lib/prisma")).rejects.toThrow(/Refusing/);
  });

  it("allows a local development PostgreSQL and production itself", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("DATABASE_URL", "postgresql://dev:dev@127.0.0.1:5432/linkly_dev");
    vi.resetModules();
    await expect(import("../lib/prisma")).resolves.toBeDefined();

    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DATABASE_URL", "postgresql://linkly_app:secret@localhost/linkly?host=/cloudsql/linkly-prod:me-central2:linkly-pg");
    vi.resetModules();
    await expect(import("../lib/prisma")).resolves.toBeDefined();
  });

  it("can be overridden explicitly", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("LINKLY_ALLOW_PRODUCTION_DATABASE", "1");
    vi.stubEnv("DATABASE_URL", "postgresql://linkly_app:secret@127.0.0.1:6543/linkly");
    vi.resetModules();
    await expect(import("../lib/prisma")).resolves.toBeDefined();
  });
});
