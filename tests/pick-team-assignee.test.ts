import { existsSync, unlinkSync } from "fs";
import { join } from "path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const testDbPath = join(process.cwd(), "tests", ".tmp-pick-team-assignee.db");
const tenantId = "tenant-pick-assignee";

beforeAll(() => {
  if (existsSync(testDbPath)) unlinkSync(testDbPath);
  vi.stubEnv("DATABASE_URL", `file:${testDbPath}`);
  vi.stubEnv("AUTH_SECRET", "test-auth-secret-with-at-least-32-characters");
});

afterAll(async () => {
  vi.unstubAllEnvs();
  const { prisma } = await import("../lib/prisma");
  await prisma.$disconnect();
  for (const suffix of ["", "-journal", "-wal", "-shm"]) {
    const path = `${testDbPath}${suffix}`;
    if (existsSync(path)) unlinkSync(path);
  }
});

function member(name: string, status: string) {
  return { employee: { name, status } };
}

describe("pickTeamAssignee", () => {
  it("only spreads 'تلقائي بالتساوي' load-balancing across online members, ignoring busy/offline ones even if they have fewer open conversations", async () => {
    const { ensureSchema } = await import("../lib/database");
    await ensureSchema();
    const { prisma } = await import("../lib/prisma");
    const { pickTeamAssignee } = await import("../lib/automation-engine");

    const customerId = "cust-roundrobin";
    await prisma.customer.create({ data: { id: customerId, name: "Customer", phone: "9665", initial: "C", tenantId } });
    // Offline member has zero open conversations (would normally win the
    // least-loaded pick), online member already has one.
    await prisma.conversation.create({
      data: { id: "conv-rr-1", customerId, channel: "whatsapp", lastMessage: "", status: "assigned", assignee: "موظف متصل", tenantId }
    });

    const team = {
      lead: "موظف متصل",
      routing: "تلقائي بالتساوي",
      members: [member("موظف متصل", "متصل"), member("موظف غير متصل", "غير متصل")]
    };

    const picked = await pickTeamAssignee(team, tenantId);
    expect(picked).toBe("موظف متصل");
  });

  it("falls back to every member when nobody on the team is online, so a conversation is never left unassigned", async () => {
    const { pickTeamAssignee } = await import("../lib/automation-engine");
    const team = {
      lead: "",
      routing: "تلقائي بالتساوي",
      members: [member("موظف مشغول", "مشغول"), member("موظف غير متصل", "غير متصل")]
    };

    const picked = await pickTeamAssignee(team, tenantId);
    expect(["موظف مشغول", "موظف غير متصل"]).toContain(picked);
  });

  it("routes direct (non-round-robin) teams away from a busy/offline lead to an online teammate", async () => {
    const { pickTeamAssignee } = await import("../lib/automation-engine");
    const team = {
      lead: "القائد المشغول",
      routing: "مباشر",
      members: [member("القائد المشغول", "مشغول"), member("الزميل المتصل", "متصل")]
    };

    const picked = await pickTeamAssignee(team, tenantId);
    expect(picked).toBe("الزميل المتصل");
  });

  it("keeps routing direct teams to the lead when the lead is online", async () => {
    const { pickTeamAssignee } = await import("../lib/automation-engine");
    const team = {
      lead: "القائد المتصل",
      routing: "مباشر",
      members: [member("القائد المتصل", "متصل"), member("زميل آخر", "غير متصل")]
    };

    const picked = await pickTeamAssignee(team, tenantId);
    expect(picked).toBe("القائد المتصل");
  });

  it("falls back to the lead even when offline if nobody on the team is online", async () => {
    const { pickTeamAssignee } = await import("../lib/automation-engine");
    const team = {
      lead: "القائد غير المتصل",
      routing: "مباشر",
      members: [member("القائد غير المتصل", "غير متصل"), member("زميل مشغول", "مشغول")]
    };

    const picked = await pickTeamAssignee(team, tenantId);
    expect(picked).toBe("القائد غير المتصل");
  });
});
