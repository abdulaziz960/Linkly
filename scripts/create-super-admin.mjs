import { randomUUID, randomBytes, scryptSync } from "node:crypto";

const email = process.env.SUPER_ADMIN_EMAIL?.trim().toLowerCase();
const name = process.env.SUPER_ADMIN_NAME?.trim() || "Super Admin";
const password = process.env.SUPER_ADMIN_PASSWORD || "";

if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  throw new Error("Set SUPER_ADMIN_EMAIL to a valid email address.");
}
if (password.length < 12 || !/\p{L}/u.test(password) || !/\d/u.test(password)) {
  throw new Error("SUPER_ADMIN_PASSWORD must be at least 12 characters and include a letter and a number.");
}

if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = "file:./dev.db";
}

const { PrismaClient } = await import("@prisma/client");
const prisma = new PrismaClient();
const salt = randomBytes(16).toString("hex");
const passwordHash = `scrypt$${salt}$${scryptSync(password, salt, 64).toString("hex")}`;

try {
  const existing = await prisma.userAccount.findUnique({ where: { email }, select: { id: true } });
  const user = existing
    ? await prisma.userAccount.update({
        where: { email },
        data: {
          name,
          role: "مالك الحساب",
          isPlatformAdmin: 1,
          passwordHash,
          sessionVersion: { increment: 1 }
        },
        select: { email: true }
      })
    : await prisma.userAccount.create({
        data: {
          id: `user-platform-${randomUUID()}`,
          name,
          email,
          passwordHash,
          role: "مالك الحساب",
          tenantId: "tenant-demo",
          isPlatformAdmin: 1,
          createdAt: new Date().toISOString()
        },
        select: { email: true }
      });

  await prisma.employeeInvite.deleteMany({ where: { email } });
  console.log(`Super Admin ready: ${user.email}`);
} finally {
  await prisma.$disconnect();
}
