// Creates (or resets) a LOCAL developer account on the top plan, for testing
// features on your own machine. It refuses to run against a hosted database,
// and credentials come from env vars (.env.local is git-ignored), never code.
//
//   DEV_ACCOUNT_EMAIL=you@example.com DEV_ACCOUNT_PASSWORD=... npm run dev:account
//
// Run `npm run dev` and open the site once first so the local tables exist.
import { randomBytes, randomUUID, scryptSync } from "node:crypto";

const email = process.env.DEV_ACCOUNT_EMAIL?.trim().toLowerCase();
const password = process.env.DEV_ACCOUNT_PASSWORD || "";
const name = process.env.DEV_ACCOUNT_NAME?.trim() || "Developer";
const planName = process.env.DEV_ACCOUNT_PLAN?.trim() || "باقة الشركات";

if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Set DEV_ACCOUNT_EMAIL to a valid email address.");
if (password.length < 8) throw new Error("Set DEV_ACCOUNT_PASSWORD (at least 8 characters).");

const databaseUrl = process.env.DATABASE_URL || "file:./dev.db";
if (!databaseUrl.startsWith("file:")) throw new Error("Refusing to run: DATABASE_URL is not a local SQLite file.");
process.env.DATABASE_URL = databaseUrl;

const { PrismaClient } = await import("@prisma/client");
const prisma = new PrismaClient();
const salt = randomBytes(16).toString("hex");
const passwordHash = `scrypt$${salt}$${scryptSync(password, salt, 64).toString("hex")}`;
const now = new Date().toISOString();

try {
  const plan = await prisma.plan.findUnique({ where: { name: planName } }).catch(() => null);
  if (!plan) throw new Error(`Plan "${planName}" not found. Start \`npm run dev\` and open the site once so the local database is created.`);

  const existing = await prisma.userAccount.findUnique({ where: { email } });
  if (existing) {
    await prisma.userAccount.update({ where: { email }, data: { passwordHash, name, disabled: 0, sessionVersion: { increment: 1 } } });
    await prisma.subscription.updateMany({
      where: { tenantId: existing.tenantId },
      data: { plan: plan.name, status: "نشط", employeeLimit: plan.employeeLimit, renewalAt: "2099-12-31", updatedAt: now }
    });
    console.log(`Updated existing local account ${email} on ${plan.name}.`);
  } else {
    const tenantId = `tenant-dev-${randomUUID()}`;
    const employeeId = `emp-${randomUUID()}`;
    await prisma.$transaction(async (tx) => {
      await tx.userAccount.create({ data: { id: `user-${employeeId}`, name, email, passwordHash, role: "مالك الحساب", tenantId, createdAt: now } });
      await tx.employee.create({ data: { id: employeeId, name, email, role: "مالك الحساب", status: "غير متصل", permissions: "الكل", initial: name.slice(0, 1) || "D", tenantId } });
      await tx.subscription.create({
        data: {
          id: `sub-${tenantId}`, tenantId, companyName: "Linkly Dev", ownerName: name, ownerEmail: email,
          plan: plan.name, status: "نشط", employeeLimit: plan.employeeLimit, amount: 0, billingCycle: "شهري",
          renewalAt: "2099-12-31", createdAt: now, updatedAt: now
        }
      });
    });
    console.log(`Created local account ${email} on ${plan.name}.`);
  }
} finally {
  await prisma.$disconnect();
}
