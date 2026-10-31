import { existsSync, unlinkSync } from "fs";
import { join } from "path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const testDbPath = join(process.cwd(), "tests", ".tmp-workspaces.db");
const SMALL = "باقة المؤسسات الصغيرة";
const LARGE = "باقة المؤسسات الكبيرة";
const INDIVIDUAL = "باقة الأفراد";

beforeAll(() => {
  if (existsSync(testDbPath)) unlinkSync(testDbPath);
  vi.stubEnv("DATABASE_URL", `file:${testDbPath}`);
  vi.stubEnv("AUTH_SECRET", "test-auth-secret-with-at-least-32-characters");
  vi.stubEnv("WORKSPACES_FEATURE", "0");
  vi.stubEnv("WORKSPACES_ENABLED_TENANTS", "");
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

async function makeAccount(prefix: string, plan: string, ownerEmail: string) {
  const { prisma } = await import("../lib/prisma");
  const tenantId = `tenant-${prefix}`;
  const userId = `user-${prefix}-owner`;
  const now = new Date().toISOString();
  await prisma.userAccount.create({ data: { id: userId, name: `مالك ${prefix}`, email: ownerEmail, passwordHash: "x", role: "مالك الحساب", tenantId, createdAt: now } });
  await prisma.employee.create({ data: { id: `emp-${prefix}-owner`, name: `مالك ${prefix}`, email: ownerEmail, role: "مالك الحساب", status: "متصل", permissions: "الكل", initial: "م", tenantId, userId } });
  await prisma.subscription.create({ data: { id: `sub-${tenantId}`, tenantId, companyName: `شركة ${prefix}`, ownerName: `مالك ${prefix}`, ownerEmail, plan, status: "نشط", employeeLimit: 10, amount: 599, billingCycle: "شهري", renewalAt: new Date(Date.now() + 20 * 86400000).toISOString(), createdAt: now, updatedAt: now } });
  const user = { id: userId, name: `مالك ${prefix}`, email: ownerEmail, role: "مالك الحساب", tenantId, isPlatformAdmin: 0, sessionVersion: 0, disabled: 0, subscriptionExpired: false } as never;
  return { tenantId, userId, user, ownerEmail };
}

async function seedConversation(tenantId: string, id: string, assignee: string, customerName: string) {
  const { prisma } = await import("../lib/prisma");
  const customerId = `cust-${id}`;
  await prisma.customer.create({ data: { id: customerId, name: customerName, phone: `9665${id.length}${Math.abs(id.split("").reduce((sum, ch) => sum + ch.charCodeAt(0), 0))}`.slice(0, 12), initial: "ع", tenantId } });
  await prisma.conversation.create({ data: { id, customerId, channel: "whatsapp", lastMessage: "مرحبا", status: assignee === "بدون موظف" ? "unassigned" : "assigned", assignee, tenantId, lastActivityAt: new Date().toISOString() } });
}

describe("workspaces are off by default and leave no trace", () => {
  it("does nothing - not even create tables - while the feature is off", async () => {
    const { ensureSchema } = await import("../lib/database");
    await ensureSchema();
    const account = await makeAccount("off", LARGE, "off-owner@example.com");
    const { workspacesEnabledForTenant, getGroupContext, billingTenantFor, isProjectChild, projectChildTenantIds } = await import("../lib/workspaces/store");
    expect(await workspacesEnabledForTenant(account.tenantId)).toBe(false);
    expect(await getGroupContext(account.tenantId)).toBeNull();
    expect(await billingTenantFor(account.tenantId)).toBe(account.tenantId);
    expect(await isProjectChild(account.tenantId)).toBe(false);
    expect((await projectChildTenantIds()).size).toBe(0);
    const { loadWorkspaceViewer } = await import("../lib/workspaces/service");
    expect(await loadWorkspaceViewer(account.user)).toBeNull();
    const { extraProjectsCharge } = await import("../lib/workspaces/addons");
    expect(await extraProjectsCharge(account.tenantId, "شهري")).toBe(0);
    const { prisma } = await import("../lib/prisma");
    const tables = await prisma.$queryRawUnsafe<Array<{ name: string }>>(`SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'workspace_%'`);
    expect(tables).toEqual([]);
  });
});

describe("who may use workspaces", () => {
  it("needs an eligible plan AND an explicit switch, both checked by the server", async () => {
    vi.stubEnv("WORKSPACES_FEATURE", "1");
    const { workspacesEnabledForTenant } = await import("../lib/workspaces/store");
    const { setWorkspaceAddon } = await import("../lib/workspaces/addon-store");
    const eligibleNotSwitched = await makeAccount("elig", LARGE, "elig@example.com");
    const eligibleSwitched = await makeAccount("sw", SMALL, "sw@example.com");
    const ineligibleSwitched = await makeAccount("inel", INDIVIDUAL, "inel@example.com");

    // The plan alone is not enough: nothing is on until the platform team switches it on.
    expect(await workspacesEnabledForTenant(eligibleNotSwitched.tenantId)).toBe(false);

    await setWorkspaceAddon(eligibleSwitched.tenantId, { enabled: true, extraProjects: 0 }, "admin");
    expect(await workspacesEnabledForTenant(eligibleSwitched.tenantId)).toBe(true);

    // The switch alone is not enough either: the plan has to support projects.
    await setWorkspaceAddon(ineligibleSwitched.tenantId, { enabled: true, extraProjects: 3 }, "admin");
    expect(await workspacesEnabledForTenant(ineligibleSwitched.tenantId)).toBe(false);

    // The development allow list works the same way and is also bounded by the plan.
    vi.stubEnv("WORKSPACES_ENABLED_TENANTS", `${eligibleNotSwitched.tenantId},${ineligibleSwitched.tenantId}`);
    expect(await workspacesEnabledForTenant(eligibleNotSwitched.tenantId)).toBe(true);
    expect(await workspacesEnabledForTenant(ineligibleSwitched.tenantId)).toBe(false);
    vi.stubEnv("WORKSPACES_ENABLED_TENANTS", "");
  });
});

describe("projects, quota and billing", () => {
  it("creates isolated projects up to the quota and keeps billing on the account", async () => {
    vi.stubEnv("WORKSPACES_FEATURE", "1");
    const { prisma } = await import("../lib/prisma");
    const store = await import("../lib/workspaces/store");
    const { setWorkspaceAddon } = await import("../lib/workspaces/addon-store");
    const account = await makeAccount("quota", SMALL, "quota@example.com");
    await setWorkspaceAddon(account.tenantId, { enabled: true, extraProjects: 1 }, "admin");
    const owner = { id: account.userId, name: "مالك quota", email: account.ownerEmail };
    const base = { billingTenantId: account.tenantId, accountName: "شركة quota", owner };

    const first = await store.createProject({ ...base, name: "مشروع أول", color: "#8e6bbf" });
    expect(first.tenantId).not.toBe(account.tenantId);
    // The plan has no included extra; one was bought: a second new project is over the limit.
    await expect(store.createProject({ ...base, name: "مشروع ثان" })).rejects.toThrow(/للحد الأقصى/);
    await expect(store.createProject({ ...base, name: "مشروع أول" })).rejects.toThrow();

    const child = await prisma.subscription.findUnique({ where: { tenantId: first.tenantId } });
    expect(child).toMatchObject({ plan: SMALL, status: "نشط", amount: 0, autoRenewEnabled: 0, savedCardToken: "" });
    const owners = await prisma.employee.findMany({ where: { tenantId: first.tenantId } });
    expect(owners).toHaveLength(1);
    expect(owners[0]).toMatchObject({ userId: account.userId, role: "مالك الحساب" });
    expect((await prisma.adminHiddenClient.findUnique({ where: { tenantId: first.tenantId } }))?.tenantId).toBe(first.tenantId);

    expect(await store.billingTenantFor(first.tenantId)).toBe(account.tenantId);
    expect(await store.isProjectChild(first.tenantId)).toBe(true);
    expect(await store.isProjectChild(account.tenantId)).toBe(false);
    expect((await store.projectChildTenantIds()).has(first.tenantId)).toBe(true);

    // Message credit is one balance for the whole account.
    const { creditCampaignBalance, getCampaignBalance } = await import("../lib/campaign-engine");
    await creditCampaignBalance(first.tenantId, 500);
    expect(await getCampaignBalance(account.tenantId)).toBe(500);
    expect(await getCampaignBalance(first.tenantId)).toBe(500);

    // The plan follows the account.
    await prisma.subscription.update({ where: { tenantId: account.tenantId }, data: { plan: LARGE, renewalAt: "2030-01-01T00:00:00.000Z" } });
    await store.syncProjectSubscriptions(account.tenantId);
    expect(await prisma.subscription.findUnique({ where: { tenantId: first.tenantId } })).toMatchObject({ plan: LARGE, renewalAt: "2030-01-01T00:00:00.000Z", amount: 0 });
  });

  it("includes one extra project in the large plan and charges the rest per project", async () => {
    vi.stubEnv("WORKSPACES_FEATURE", "1");
    const store = await import("../lib/workspaces/store");
    const { setWorkspaceAddon } = await import("../lib/workspaces/addon-store");
    const { projectQuota, extraProjectsMonthlyCharge, EXTRA_PROJECT_PRICE_SAR } = await import("../lib/workspaces/feature");
    const { extraProjectsCharge } = await import("../lib/workspaces/addons");
    const { priceForCycle } = await import("../lib/billing-pricing");

    expect(projectQuota(SMALL, 0).maxProjects).toBe(1);
    expect(projectQuota(LARGE, 0).maxProjects).toBe(2);
    expect(projectQuota(LARGE, 2).maxProjects).toBe(4);

    const account = await makeAccount("large", LARGE, "large@example.com");
    await setWorkspaceAddon(account.tenantId, { enabled: true, extraProjects: 0 }, "admin");
    const base = { billingTenantId: account.tenantId, accountName: "شركة large", owner: { id: account.userId, name: "مالك large", email: account.ownerEmail } };
    await store.createProject({ ...base, name: "المشروع المشمول" });
    await expect(store.createProject({ ...base, name: "مشروع زائد" })).rejects.toThrow(/للحد الأقصى/);
    // What the plan includes costs nothing extra.
    expect(await extraProjectsCharge(account.tenantId, "شهري")).toBe(0);

    // 3 bought projects: 3 x 350 = 1050 on top of the plan price, with the cycle discount on a yearly payment.
    await setWorkspaceAddon(account.tenantId, { enabled: true, extraProjects: 3 }, "admin");
    expect(EXTRA_PROJECT_PRICE_SAR).toBe(350);
    expect(extraProjectsMonthlyCharge(3)).toBe(1050);
    expect(await extraProjectsCharge(account.tenantId, "شهري")).toBe(1050);
    expect(await extraProjectsCharge(account.tenantId, "سنوي")).toBe(priceForCycle(1050, "سنوي"));
    // A project of the account is charged through the account, never on its own.
    const child = (await store.getGroupContext(account.tenantId))!.projects.find((project) => !project.primary)!;
    expect(await extraProjectsCharge(child.tenantId, "شهري")).toBe(1050);
    await store.createProject({ ...base, name: "مشروع مشترى 1" });
    await store.createProject({ ...base, name: "مشروع مشترى 2" });
    await store.createProject({ ...base, name: "مشروع مشترى 3" });
    await expect(store.createProject({ ...base, name: "مشروع خامس" })).rejects.toThrow(/للحد الأقصى/);
  });
});

describe("isolation between projects, accounts and people", () => {
  it("shows each viewer only what they may see, and hands conversations over narrowly", async () => {
    vi.stubEnv("WORKSPACES_FEATURE", "1");
    const { prisma } = await import("../lib/prisma");
    const store = await import("../lib/workspaces/store");
    const { setWorkspaceAddon } = await import("../lib/workspaces/addon-store");
    const { loadWorkspaceViewer } = await import("../lib/workspaces/service");
    const { aggregatedConversations, crossProjectConversations } = await import("../lib/workspaces/inbox");
    const { assignAcrossProjects } = await import("../lib/workspaces/assign");
    const { actingUserForConversation } = await import("../lib/workspaces/acting");
    const { canAccessConversation, getVisibleAssigneeNames } = await import("../lib/permissions-server");

    const account = await makeAccount("iso", LARGE, "iso-owner@example.com");
    await setWorkspaceAddon(account.tenantId, { enabled: true, extraProjects: 2 }, "admin");
    const owner = { id: account.userId, name: "مالك iso", email: account.ownerEmail };
    const base = { billingTenantId: account.tenantId, accountName: "شركة iso", owner };
    const projectB = await store.createProject({ ...base, name: "مشروع ب" });
    const projectC = await store.createProject({ ...base, name: "مشروع ج" });

    // An employee who belongs to project B only.
    const staffUserId = "user-iso-staff";
    await prisma.userAccount.create({ data: { id: staffUserId, name: "ليلى", email: "iso-staff@example.com", passwordHash: "x", role: "موظف دعم", tenantId: projectB.tenantId, createdAt: new Date().toISOString() } });
    const staffEmployee = await prisma.employee.create({ data: { id: "emp-iso-staff", name: "ليلى", email: "iso-staff@example.com", role: "موظف دعم", status: "متصل", permissions: "", initial: "ل", tenantId: projectB.tenantId, userId: staffUserId } });
    const staffUser = { id: staffUserId, name: "ليلى", email: "iso-staff@example.com", role: "موظف دعم", tenantId: projectB.tenantId, isPlatformAdmin: 0, sessionVersion: 0, disabled: 0, subscriptionExpired: false } as never;

    await seedConversation(account.tenantId, "conv-iso-a1", "بدون موظف", "عميل أ1");
    await seedConversation(account.tenantId, "conv-iso-a2", "بدون موظف", "عميل أ2");
    await seedConversation(projectB.tenantId, "conv-iso-b1", "ليلى", "عميل ب1");
    await seedConversation(projectB.tenantId, "conv-iso-b2", "بدون موظف", "عميل ب2");
    await seedConversation(projectC.tenantId, "conv-iso-c1", "بدون موظف", "عميل ج1");

    // The owner sees every project's conversations, each labelled with its project.
    const ownerViewer = (await loadWorkspaceViewer(account.user))!;
    expect(ownerViewer.ownsAccount).toBe(true);
    expect(ownerViewer.memberships).toHaveLength(3);
    const all = await aggregatedConversations(ownerViewer);
    expect(all.map((conversation) => conversation.id).sort()).toEqual(["conv-iso-a1", "conv-iso-a2", "conv-iso-b1", "conv-iso-b2", "conv-iso-c1"]);
    expect(all.find((conversation) => conversation.id === "conv-iso-b1")).toMatchObject({ projectId: projectB.id, projectName: "مشروع ب" });
    expect(new Set(all.map((conversation) => conversation.id)).size).toBe(all.length);

    // The employee belongs to project B only: they never get a combined view, nor the other projects' data.
    const staffViewer = (await loadWorkspaceViewer(staffUser))!;
    expect(staffViewer.ownsAccount).toBe(false);
    expect(staffViewer.memberships.map((entry) => entry.project.id)).toEqual([projectB.id]);
    expect((await aggregatedConversations(staffViewer)).map((conversation) => conversation.id)).toEqual(["conv-iso-b1"]);
    expect(await crossProjectConversations(staffViewer)).toEqual([]);

    // The owner of project A hands one of A's conversations to the employee of B.
    const assigned = await assignAcrossProjects(ownerViewer, "conv-iso-a1", staffEmployee.id);
    expect(assigned.assignee).toBe("ليلى (مشروع ب)");
    expect(await prisma.conversation.findUnique({ where: { id: "conv-iso-a1" } })).toMatchObject({ assignee: "ليلى (مشروع ب)", status: "assigned" });

    // They now see that conversation - and only that one - from the other project.
    const handed = await crossProjectConversations(staffViewer);
    expect(handed.map((conversation) => conversation.id)).toEqual(["conv-iso-a1"]);
    expect(handed[0]).toMatchObject({ crossProject: true, projectName: expect.any(String) });

    // They can work that conversation as an employee of its workspace, and nothing else of it.
    const acting = await actingUserForConversation(staffUser as { id: string; tenantId: string; role: string; name: string; email: string }, "conv-iso-a1");
    expect(acting.tenantId).toBe(account.tenantId);
    expect(acting.role).toBe("موظف");
    expect(await canAccessConversation(acting, "conv-iso-a1")).toBe(true);
    expect(await canAccessConversation(acting, "conv-iso-a2")).toBe(false);
    expect(await getVisibleAssigneeNames(acting, null)).toEqual(["ليلى (مشروع ب)"]);
    // A conversation not handed to them, in A or in C, gives them nothing.
    expect((await actingUserForConversation(staffUser as { id: string; tenantId: string; role: string; name: string; email: string }, "conv-iso-a2")).tenantId).toBe(projectB.tenantId);
    expect((await actingUserForConversation(staffUser as { id: string; tenantId: string; role: string; name: string; email: string }, "conv-iso-c1")).tenantId).toBe(projectB.tenantId);
    // Someone else (the owner of another account) cannot use that hand-over.
    const stranger = await makeAccount("stranger", LARGE, "stranger@example.com");
    expect((await actingUserForConversation(stranger.user as unknown as { id: string; tenantId: string; role: string; name: string; email: string }, "conv-iso-a1")).tenantId).toBe(stranger.tenantId);

    // A normal reassignment inside the project ends the hand-over.
    const { clearCrossAssignment } = await import("../lib/workspaces/acting");
    await clearCrossAssignment(account.tenantId, "conv-iso-a1");
    expect(await crossProjectConversations(staffViewer)).toEqual([]);
    expect((await actingUserForConversation(staffUser as { id: string; tenantId: string; role: string; name: string; email: string }, "conv-iso-a1")).tenantId).toBe(projectB.tenantId);

    // Handing over can only target employees of the same account.
    const outsider = await prisma.employee.create({ data: { id: "emp-outsider", name: "غريب", email: "outsider@example.com", role: "موظف دعم", status: "متصل", permissions: "", initial: "غ", tenantId: stranger.tenantId, userId: "user-outsider" } });
    await expect(assignAcrossProjects(ownerViewer, "conv-iso-a2", outsider.id)).rejects.toThrow();
    // ...and only conversations of the caller's own workspace.
    await expect(assignAcrossProjects(ownerViewer, "conv-iso-b2", staffEmployee.id)).rejects.toThrow();
  });

  it("keeps one channel in one project of an account", async () => {
    vi.stubEnv("WORKSPACES_FEATURE", "1");
    const { prisma } = await import("../lib/prisma");
    const store = await import("../lib/workspaces/store");
    const { setWorkspaceAddon } = await import("../lib/workspaces/addon-store");
    const { channelUsedByOtherProject } = await import("../lib/workspaces/channels");
    const account = await makeAccount("chan", LARGE, "chan@example.com");
    await setWorkspaceAddon(account.tenantId, { enabled: true, extraProjects: 1 }, "admin");
    const project = await store.createProject({ billingTenantId: account.tenantId, accountName: "شركة chan", owner: { id: account.userId, name: "مالك chan", email: account.ownerEmail }, name: "مشروع القناة" });
    await prisma.integrationSetting.create({ data: { id: "int-chan-main", tenantId: account.tenantId, provider: "whatsapp_cloud", status: "connected", businessName: "", wabaName: "", phoneNumber: "", phoneNumberId: "PN-ONE", wabaId: "WABA-ONE", appId: "", verifyToken: "v", accessToken: "t", webhookUrl: "/api/meta/webhook", updatedAt: "اليوم" } });
    // The project cannot take the number the account's main workspace already uses...
    expect(await channelUsedByOtherProject(project.tenantId, { phoneNumberId: "PN-ONE" })).toBe("شركة chan");
    expect(await channelUsedByOtherProject(project.tenantId, { wabaId: "WABA-ONE" })).not.toBeNull();
    // ...but a different number is free, and the same workspace re-saving its own number is not blocked by itself.
    expect(await channelUsedByOtherProject(project.tenantId, { phoneNumberId: "PN-TWO" })).toBeNull();
    expect(await channelUsedByOtherProject(account.tenantId, { phoneNumberId: "PN-ONE" })).toBeNull();
    // An account outside any group is never checked.
    const loner = await makeAccount("loner", SMALL, "loner@example.com");
    expect(await channelUsedByOtherProject(loner.tenantId, { phoneNumberId: "PN-ONE" })).toBeNull();
  });
});
