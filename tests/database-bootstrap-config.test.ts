import { afterEach, describe, expect, it, vi } from "vitest";

describe("database bootstrap configuration", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("does not make authentication unavailable when optional admin bootstrap settings are incomplete", async () => {
    vi.stubEnv("SUPER_ADMIN_EMAIL", "");
    vi.stubEnv("SUPER_ADMIN_BOOTSTRAP_PASSWORD", "legacy-password-123");
    vi.resetModules();

    await expect(import("../lib/database")).resolves.toBeDefined();
  });
});
