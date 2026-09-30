import { existsSync, unlinkSync } from "fs";
import { join } from "path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const testDbPath = join(process.cwd(), "tests", ".tmp-login-lockout-and-2fa.db");
const now = new Date().toISOString();

async function seedUser(email: string, overrides: Partial<{ disabled: number; lockedAt: string; failedLoginAttempts: number; twoFactorEnabled: number }> = {}) {
  const { prisma } = await import("../lib/prisma");
  const { hashPassword } = await import("../lib/passwords");
  const id = `user-${email.split("@")[0]}`;
  await prisma.userAccount.create({
    data: {
      id,
      name: "Test User",
      email,
      passwordHash: hashPassword("Correct-Password-1"),
      role: "مالك الحساب",
      tenantId: `tenant-${id}`,
      createdAt: now,
      ...overrides
    }
  });
  return id;
}

function loginRequest(email: string, password: string) {
  return new NextRequest("http://localhost/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password })
  });
}

beforeAll(async () => {
  if (existsSync(testDbPath)) unlinkSync(testDbPath);
  vi.stubEnv("DATABASE_URL", `file:${testDbPath}`);
  vi.stubEnv("AUTH_SECRET", "test-auth-secret-with-at-least-32-characters");
  const { ensureSchema } = await import("../lib/database");
  await ensureSchema();
});

afterAll(async () => {
  const { prisma } = await import("../lib/prisma");
  await prisma.$disconnect();
  vi.unstubAllEnvs();
  for (const suffix of ["", "-journal", "-wal", "-shm"]) {
    const path = `${testDbPath}${suffix}`;
    if (existsSync(path)) unlinkSync(path);
  }
});

describe("failed-login lockout", () => {
  it("nudges toward password reset on the 3rd wrong attempt, locks on the 5th, and keeps reporting locked afterward without incrementing further", async () => {
    const email = "lockout-target@login-lockout.example";
    await seedUser(email);
    const { POST } = await import("../app/api/auth/login/route");
    const { prisma } = await import("../lib/prisma");

    const first = await POST(loginRequest(email, "wrong-1"));
    expect(first.status).toBe(401);
    expect((await first.json()).message).toBe("بيانات الدخول غير صحيحة");

    await POST(loginRequest(email, "wrong-2"));

    const third = await POST(loginRequest(email, "wrong-3"));
    expect(third.status).toBe(401);
    expect((await third.json()).message).toContain("تم إرسال رابط لإعادة تعيين كلمة السر");
    const invite = await prisma.employeeInvite.findFirst({ where: { email } });
    expect(invite).not.toBeNull();

    await POST(loginRequest(email, "wrong-4"));

    const fifth = await POST(loginRequest(email, "wrong-5"));
    expect(fifth.status).toBe(403);
    expect((await fifth.json()).message).toContain("تم إيقاف حسابك");

    const lockedAccount = await prisma.userAccount.findUniqueOrThrow({ where: { email } });
    expect(lockedAccount.disabled).toBe(1);
    expect(lockedAccount.lockedAt).not.toBe("");
    expect(lockedAccount.failedLoginAttempts).toBe(5);

    const sixth = await POST(loginRequest(email, "wrong-6"));
    expect(sixth.status).toBe(403);
    expect((await sixth.json()).message).toContain("تم إيقاف حسابك");
    const stillLocked = await prisma.userAccount.findUniqueOrThrow({ where: { email } });
    expect(stillLocked.failedLoginAttempts).toBe(5);

    // Even the correct password is rejected while locked.
    const correctWhileLocked = await POST(loginRequest(email, "Correct-Password-1"));
    expect(correctWhileLocked.status).toBe(403);
    expect((await correctWhileLocked.json()).message).toContain("تم إيقاف حسابك");
  });

  it("clears the counter on a successful login", async () => {
    const email = "recovers-target@login-lockout.example";
    await seedUser(email);
    const { POST } = await import("../app/api/auth/login/route");
    const { prisma } = await import("../lib/prisma");

    await POST(loginRequest(email, "wrong-1"));
    await POST(loginRequest(email, "wrong-2"));
    const success = await POST(loginRequest(email, "Correct-Password-1"));
    expect(success.status).toBe(200);

    const account = await prisma.userAccount.findUniqueOrThrow({ where: { email } });
    expect(account.failedLoginAttempts).toBe(0);
  });

  it("still shows the generic admin-disabled message (not the lockout message) for a correct password on an admin-disabled account", async () => {
    const email = "admin-disabled@login-lockout.example";
    await seedUser(email, { disabled: 1, lockedAt: "" });
    const { POST } = await import("../app/api/auth/login/route");

    const response = await POST(loginRequest(email, "Correct-Password-1"));
    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.message).toContain("تم تعطيل هذا الحساب");
    expect(body.message).not.toContain("تم إيقاف حسابك");
  });

  it("never reveals an admin-disabled account via a wrong password", async () => {
    const email = "admin-disabled-wrong-pw@login-lockout.example";
    await seedUser(email, { disabled: 1, lockedAt: "" });
    const { POST } = await import("../app/api/auth/login/route");

    const response = await POST(loginRequest(email, "totally-wrong"));
    expect(response.status).toBe(401);
    expect((await response.json()).message).toBe("بيانات الدخول غير صحيحة");
  });

  it("lets a locked account recover via the password-reset link, which clears the lock", async () => {
    const email = "self-locked-recovers@login-lockout.example";
    await seedUser(email, { disabled: 1, lockedAt: now, failedLoginAttempts: 5 });
    const { prisma } = await import("../lib/prisma");
    const { createHash, randomBytes } = await import("crypto");
    const token = randomBytes(32).toString("hex");
    await prisma.employeeInvite.create({
      data: {
        id: "reset-self-locked",
        email,
        tokenHash: createHash("sha256").update(token).digest("hex"),
        expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        createdAt: now,
        purpose: "password_reset"
      }
    });

    const { POST: activate } = await import("../app/api/auth/activate/route");
    const activateResponse = await activate(new NextRequest("http://localhost/api/auth/activate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, password: "New-Password-1" })
    }));
    expect(activateResponse.status).toBe(200);

    const unlocked = await prisma.userAccount.findUniqueOrThrow({ where: { email } });
    expect(unlocked.disabled).toBe(0);
    expect(unlocked.lockedAt).toBe("");
    expect(unlocked.failedLoginAttempts).toBe(0);

    const { POST: login } = await import("../app/api/auth/login/route");
    const loginResponse = await login(loginRequest(email, "New-Password-1"));
    expect(loginResponse.status).toBe(200);
  });
});

describe("optional email 2FA", () => {
  it("returns twoFactorRequired with a pending token and never sets a session cookie", async () => {
    const email = "2fa-user@login-lockout.example";
    await seedUser(email, { twoFactorEnabled: 1 });
    const { POST } = await import("../app/api/auth/login/route");

    const response = await POST(loginRequest(email, "Correct-Password-1"));
    expect(response.status).toBe(200);
    const body = await response.json() as { twoFactorRequired?: boolean; pendingToken?: string; code?: string };
    expect(body.twoFactorRequired).toBe(true);
    expect(body.pendingToken).toBeTruthy();
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("rejects a wrong code, exhausts after 5 wrong guesses, and completes login on the correct code", async () => {
    const email = "2fa-verify-user@login-lockout.example";
    await seedUser(email, { twoFactorEnabled: 1 });
    const { POST: login } = await import("../app/api/auth/login/route");
    const { POST: verify } = await import("../app/api/auth/2fa/verify/route");

    const loginResponse = await login(loginRequest(email, "Correct-Password-1"));
    const { pendingToken, code } = await loginResponse.json() as { pendingToken: string; code: string };
    expect(code).toMatch(/^\d{6}$/);

    function verifyRequest(submittedCode: string) {
      return new NextRequest("http://localhost/api/auth/2fa/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pendingToken, code: submittedCode })
      });
    }

    for (let attempt = 0; attempt < 5; attempt++) {
      const wrong = await verify(verifyRequest("000000"));
      expect(wrong.status).toBe(401);
    }
    const exhausted = await verify(verifyRequest(code));
    expect(exhausted.status).toBe(401);
    expect((await exhausted.json()).message).toContain("محاولات كثيرة");
  });

  it("completes login with the correct code and matches a direct login's redirect", async () => {
    const email = "2fa-success-user@login-lockout.example";
    await seedUser(email, { twoFactorEnabled: 1 });
    const { POST: login } = await import("../app/api/auth/login/route");
    const { POST: verify } = await import("../app/api/auth/2fa/verify/route");

    const loginResponse = await login(loginRequest(email, "Correct-Password-1"));
    const { pendingToken, code } = await loginResponse.json() as { pendingToken: string; code: string };

    const verifyResponse = await verify(new NextRequest("http://localhost/api/auth/2fa/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pendingToken, code })
    }));
    expect(verifyResponse.status).toBe(200);
    expect(verifyResponse.headers.get("set-cookie")).toBeTruthy();
    const body = await verifyResponse.json() as { redirectTo?: string };
    expect(body.redirectTo).toMatch(/^\/dashboard/);
  });

  it("resends a fresh code that invalidates the previous one", async () => {
    const email = "2fa-resend-user@login-lockout.example";
    await seedUser(email, { twoFactorEnabled: 1 });
    const { POST: login } = await import("../app/api/auth/login/route");
    const { POST: resend } = await import("../app/api/auth/2fa/resend/route");
    const { POST: verify } = await import("../app/api/auth/2fa/verify/route");

    const loginResponse = await login(loginRequest(email, "Correct-Password-1"));
    const { pendingToken, code: firstCode } = await loginResponse.json() as { pendingToken: string; code: string };

    const resendResponse = await resend(new NextRequest("http://localhost/api/auth/2fa/resend", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pendingToken })
    }));
    expect(resendResponse.status).toBe(200);
    const { code: secondCode } = await resendResponse.json() as { code: string };
    expect(secondCode).not.toBe(firstCode);

    const oldCodeAttempt = await verify(new NextRequest("http://localhost/api/auth/2fa/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pendingToken, code: firstCode })
    }));
    expect(oldCodeAttempt.status).toBe(401);

    const newCodeAttempt = await verify(new NextRequest("http://localhost/api/auth/2fa/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pendingToken, code: secondCode })
    }));
    expect(newCodeAttempt.status).toBe(200);
  });
});
