import { createHash, randomBytes, randomUUID } from "crypto";
import { prisma } from "./prisma";
import { ensureSchema } from "./database";
import { sendActivationEmail } from "./email";

function nowTimestamp() {
  return new Intl.DateTimeFormat("ar-SA-u-nu-latn", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Riyadh",
    numberingSystem: "latn",
    calendar: "gregory"
  }).format(new Date());
}

export async function getPlatformTeam() {
  await ensureSchema();
  return prisma.userAccount.findMany({
    where: { isPlatformAdmin: 1 },
    select: { id: true, name: true, email: true, createdAt: true },
    orderBy: { createdAt: "asc" }
  });
}

/**
 * Invites a brand-new platform team member. Deliberately refuses if the
 * email already has an account on the platform - silently upgrading an
 * existing account (which could belong to an unrelated tenant customer) to
 * platform admin just because someone typed that email into this form would
 * be a serious access-control mistake, not a convenience worth supporting.
 */
export async function invitePlatformAdmin(input: { name: string; email: string }, origin: string) {
  await ensureSchema();
  const email = input.email.trim().toLowerCase();
  const name = input.name.trim();

  if (!name) throw new Error("الاسم مطلوب");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("صيغة البريد الإلكتروني غير صحيحة");

  const existing = await prisma.userAccount.findUnique({ where: { email } });
  if (existing) throw new Error("هذا البريد مستخدم لحساب موجود على المنصة بالفعل");

  const now = new Date();
  const resetToken = randomBytes(32).toString("hex");
  const tokenHash = createHash("sha256").update(resetToken).digest("hex");
  const expiresAt = new Date(now.getTime() + 1000 * 60 * 60 * 24 * 3).toISOString();
  const userId = `user-platform-${createHash("sha256").update(email).digest("hex").slice(0, 10)}`;

  await prisma.$transaction([
    prisma.userAccount.create({
      data: {
        id: userId,
        name,
        email,
        passwordHash: "",
        role: "مالك الحساب",
        tenantId: "tenant-demo",
        isPlatformAdmin: 1,
        createdAt: nowTimestamp()
      }
    }),
    prisma.employeeInvite.deleteMany({ where: { email } }),
    prisma.employeeInvite.create({
      data: { id: `invite-${randomUUID()}`, email, tokenHash, expiresAt, createdAt: now.toISOString(), purpose: "employee_activation" }
    })
  ]);

  const activationUrl = `${origin}/activate?token=${resetToken}`;
  const delivery = await sendActivationEmail({ to: email, name, activationUrl });

  return { delivery };
}

export async function revokePlatformAdmin(id: string, requestingUserId: string) {
  await ensureSchema();
  if (id === requestingUserId) throw new Error("لا يمكنك إزالة صلاحيتك عن نفسك");

  const adminCount = await prisma.userAccount.count({ where: { isPlatformAdmin: 1 } });
  if (adminCount <= 1) throw new Error("لا يمكن إزالة آخر عضو في فريق المنصة");

  const target = await prisma.userAccount.findUnique({ where: { id } });
  if (!target || target.isPlatformAdmin !== 1) throw new Error("العضو غير موجود");

  await prisma.userAccount.update({ where: { id }, data: { isPlatformAdmin: 0 } });
}
