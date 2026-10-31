import { existsSync, unlinkSync } from "fs";
import { join } from "path";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const testDbPath = join(process.cwd(), "tests", ".tmp-workspaces-routes.db");
const LARGE = "باقة المؤسسات الكبيرة";
const INDIVIDUAL = "باقة الأفراد";

let currentUser: Record<string, unknown> | null = null;
const cookieJar: Record<string, string> = {};
let admin: { name: string } | null = { name: "مدير المنصة" };

vi.mock("../lib/auth", () => ({
  authCookieName: "audiencew_session",
  getCurrentUser: async () => currentUser
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => (cookieJar[name] === undefined ? undefined : { value: cookieJar[name] }) })
}));
vi.mock("../lib/admin-auth", () => ({ requirePlatformAdmin: async () => admin }));
vi.mock("../lib/origin-guard", () => ({ isTrustedOrigin: () => true }));
vi.mock("../lib/admin-audit", () => ({ recordAdminAction: async () => undefined }));

beforeAll(() => {
  if (existsSync(testDbPath)) unlinkSync(testDbPath);
  vi.stubEnv("DATABASE_URL", `file:${testDbPath}`);
  vi.stubEnv("AUTH_SECRET", "test-auth-secret-with-at-least-32-characters");
  vi.stubEnv("WORKSPACES_FEATURE", "1");
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

function request(path: string, method = "GET", body?: unknown) {
  return new NextRequest(`http://localhost${path}`, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
}

async function account(prefix: string, plan: string) {
  const { prisma } = await import("../lib/prisma");
  const tenantId = `tenant-${prefix}`;
  const userId = `user-${prefix}`;
  const email = `${prefix}@example.com`;
  const now = new Date().toISOString();
  await prisma.userAccount.create({ data: { id: userId, name: `مالك ${prefix}`, email, passwordHash: "x", role: "مالك الحساب", tenantId, createdAt: now } });
  await prisma.employee.create({ data: { id: `emp-${prefix}`, name: `مالك ${prefix}`, email, role: "مالك الحساب", status: "متصل", permissions: "الكل", initial: "م", tenantId, userId } });
  await prisma.subscription.create({ data: { id: `sub-${tenantId}`, tenantId, companyName: `شركة ${prefix}`, ownerName: `مالك ${prefix}`, ownerEmail: email, plan, status: "نشط", employeeLimit: 10, amount: 599, billingCycle: "شهري", renewalAt: new Date(Date.now() + 20 * 86400000).toISOString(), createdAt: now, updatedAt: now } });
  return { tenantId, userId, email, user: { id: userId, name: `مالك ${prefix}`, email, role: "مالك الحساب", tenantId, isPlatformAdmin: 0, sessionVersion: 0, disabled: 0, subscriptionExpired: false } };
}

describe("workspaces API", () => {
  it("answers 404 to every call for an account that is not switched on, whatever it sends", async () => {
    const { ensureSchema } = await import("../lib/database");
    await ensureSchema();
    const plain = await account("plain", LARGE);
    currentUser = plain.user;

    const state = await import("../app/api/workspaces/route");
    const projects = await import("../app/api/workspaces/projects/route");
    const project = await import("../app/api/workspaces/projects/[id]/route");
    const scope = await import("../app/api/workspaces/scope/route");
    const inbox = await import("../app/api/workspaces/inbox/route");
    const assignees = await import("../app/api/workspaces/assignees/route");
    const assign = await import("../app/api/workspaces/assign/route");

    expect((await state.GET()).status).toBe(404);
    expect((await projects.POST(request("/api/workspaces/projects", "POST", { name: "مشروع" }))).status).toBe(404);
    expect((await project.PATCH(request("/api/workspaces/projects/x", "PATCH", { name: "x" }), { params: Promise.resolve({ id: "x" }) })).status).toBe(404);
    expect((await scope.POST(request("/api/workspaces/scope", "POST", { scope: "all" }))).status).toBe(404);
    expect((await inbox.GET(request("/api/workspaces/inbox?mode=all"))).status).toBe(404);
    expect((await assignees.GET()).status).toBe(404);
    expect((await assign.POST(request("/api/workspaces/assign", "POST", { conversationId: "c", employeeId: "e" }))).status).toBe(404);
    expect((await state.GET()).status).toBe(404);

    // Signed out: the same.
    currentUser = null;
    expect((await state.GET()).status).toBe(404);

    // A plan that cannot have projects stays closed even if somebody flips the switch for it.
    const small = await account("indiv", INDIVIDUAL);
    const { setWorkspaceAddon } = await import("../lib/workspaces/addon-store");
    await setWorkspaceAddon(small.tenantId, { enabled: true, extraProjects: 2 }, "admin");
    currentUser = small.user;
    expect((await state.GET()).status).toBe(404);
  });

  it("lets only the account owner create and manage projects, and keeps people inside their own projects", async () => {
    const { prisma } = await import("../lib/prisma");
    const { setWorkspaceAddon } = await import("../lib/workspaces/addon-store");
    const owner = await account("own", LARGE);
    await setWorkspaceAddon(owner.tenantId, { enabled: true, extraProjects: 2 }, "admin");
    currentUser = owner.user;

    const state = await import("../app/api/workspaces/route");
    const projects = await import("../app/api/workspaces/projects/route");
    const project = await import("../app/api/workspaces/projects/[id]/route");
    const scope = await import("../app/api/workspaces/scope/route");

    const first = await (await state.GET()).json();
    expect(first.data).toMatchObject({ enabled: true, ownsAccount: true, canViewAll: false, quota: { used: 1, max: 4 } });
    expect(first.data.projects).toHaveLength(1);

    const created = await (await projects.POST(request("/api/workspaces/projects", "POST", { name: "مشروع جديد", color: "#8e6bbf" }))).json();
    expect(created.ok).toBe(true);
    expect(created.data.projects.map((p: { name: string }) => p.name)).toContain("مشروع جديد");
    expect(created.data.quota).toEqual({ used: 2, max: 4 });
    const newProject = created.data.projects.find((p: { name: string }) => p.name === "مشروع جديد");

    // Rename; the project id is checked against the owner's own account, never trusted.
    const renamed = await project.PATCH(request(`/api/workspaces/projects/${newProject.id}`, "PATCH", { name: "اسم جديد" }), { params: Promise.resolve({ id: newProject.id }) });
    expect(renamed.status).toBe(200);
    expect((await project.PATCH(request("/api/workspaces/projects/not-mine", "PATCH", { name: "x" }), { params: Promise.resolve({ id: "not-mine" }) })).status).toBe(400);
    const primary = first.data.projects[0];
    expect((await (await project.PATCH(request(`/api/workspaces/projects/${primary.id}`, "PATCH", { archived: true }), { params: Promise.resolve({ id: primary.id }) })).json()).error).toMatch(/الأساسي/);

    // Entering a project makes it the user's working workspace; an unknown project is refused.
    const entered = await scope.POST(request("/api/workspaces/scope", "POST", { scope: newProject.id }));
    expect(entered.status).toBe(200);
    const projectRow = (await prisma.$queryRaw<Array<{ tenant_id: string }>>`SELECT tenant_id FROM workspace_projects WHERE id = ${newProject.id}`)[0];
    expect((await prisma.userAccount.findUnique({ where: { id: owner.userId } }))?.tenantId).toBe(projectRow.tenant_id);
    expect((await scope.POST(request("/api/workspaces/scope", "POST", { scope: "wsp-unknown" }))).status).toBe(403);
    expect(entered.cookies.get("linkly_ws_scope")?.value).toBe(newProject.id);

    // The combined view is for people who belong to more than one project.
    currentUser = { ...owner.user, tenantId: owner.tenantId };
    await prisma.userAccount.update({ where: { id: owner.userId }, data: { tenantId: owner.tenantId } });
    const all = await scope.POST(request("/api/workspaces/scope", "POST", { scope: "all" }));
    expect(all.status).toBe(200);
    expect(all.cookies.get("linkly_ws_scope")?.value).toBe("all");

    // An employee of the account: no creating, no renaming, no projects they do not belong to.
    const staffId = "user-own-staff";
    await prisma.userAccount.create({ data: { id: staffId, name: "موظف", email: "own-staff@example.com", passwordHash: "x", role: "موظف دعم", tenantId: owner.tenantId, createdAt: new Date().toISOString() } });
    await prisma.employee.create({ data: { id: "emp-own-staff", name: "موظف", email: "own-staff@example.com", role: "موظف دعم", status: "متصل", permissions: "", initial: "م", tenantId: owner.tenantId, userId: staffId } });
    currentUser = { id: staffId, name: "موظف", email: "own-staff@example.com", role: "موظف دعم", tenantId: owner.tenantId, isPlatformAdmin: 0, sessionVersion: 0, disabled: 0, subscriptionExpired: false };
    expect((await projects.POST(request("/api/workspaces/projects", "POST", { name: "ممنوع" }))).status).toBe(403);
    expect((await project.PATCH(request(`/api/workspaces/projects/${newProject.id}`, "PATCH", { name: "ممنوع" }), { params: Promise.resolve({ id: newProject.id }) })).status).toBe(403);
    expect((await scope.POST(request("/api/workspaces/scope", "POST", { scope: newProject.id }))).status).toBe(403);
    expect((await scope.POST(request("/api/workspaces/scope", "POST", { scope: "all" }))).status).toBe(403);
    const staffState = await (await state.GET()).json();
    expect(staffState.data.ownsAccount).toBe(false);
    expect(staffState.data.projects.filter((p: { member: boolean }) => p.member)).toHaveLength(1);
  });
});

describe("admin panel switch", () => {
  it("only turns projects on for plans that support them and reports what is added to the subscription", async () => {
    const route = await import("../app/api/admin/clients/[id]/workspaces/route");
    const supported = await account("adm", LARGE);
    const unsupported = await account("adm-no", INDIVIDUAL);

    const put = (id: string, body: unknown) => route.PUT(request(`/api/admin/clients/${id}/workspaces`, "PUT", body), { params: Promise.resolve({ id }) });
    const ok = await (await put(supported.tenantId, { enabled: true, extraProjects: 3 })).json();
    expect(ok.data).toMatchObject({ enabled: true, extraProjects: 3, includedByPlan: 1, maxProjects: 5, unitPrice: 350, monthlyAddition: 1050, planSupportsProjects: true });
    expect((await (await route.GET(request("/x"), { params: Promise.resolve({ id: supported.tenantId }) })).json()).data.extraProjects).toBe(3);

    expect((await put(unsupported.tenantId, { enabled: true, extraProjects: 0 })).status).toBe(400);
    expect((await put(supported.tenantId, { enabled: true, extraProjects: -1 })).status).toBe(400);
    expect((await put(supported.tenantId, { extraProjects: 1 })).status).toBe(400);
    expect((await put("tenant-missing", { enabled: true, extraProjects: 0 })).status).toBe(404);

    admin = null;
    expect((await put(supported.tenantId, { enabled: false, extraProjects: 0 })).status).toBe(403);
    admin = { name: "مدير المنصة" };
  });
});
