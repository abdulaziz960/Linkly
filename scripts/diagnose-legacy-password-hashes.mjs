// Read-only diagnostic for pre-launch audit finding F-02: lib/passwords.ts
// still accepts a legacy unsalted-SHA-256 password hash for backward
// compatibility, auto-upgrading it to scrypt on that account's next
// successful login. Any account that hasn't logged in since the scrypt
// migration is still protected only by the weaker legacy hash. This finds
// them by shape (a bare 64-char hex string, scrypt hashes are always
// "scrypt$<salt>$<key>") without ever printing a hash value.
//
// Run against production with:
//   DATABASE_URL="<postgres connection string>" node scripts/prisma-generate.mjs
//   DATABASE_URL="<postgres connection string>" node scripts/diagnose-legacy-password-hashes.mjs
// Makes no writes - safe to run repeatedly.

if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = "file:./dev.db";
}

const LEGACY_SHA256_SHAPE = /^[a-f0-9]{64}$/i;

const { PrismaClient } = await import("@prisma/client");
const prisma = new PrismaClient();

try {
  const users = await prisma.userAccount.findMany({
    select: { id: true, email: true, tenantId: true, isPlatformAdmin: true, lastLoginAt: true, passwordHash: true }
  });

  const legacy = users.filter((user) => LEGACY_SHA256_SHAPE.test(user.passwordHash || ""));

  console.log(`Scanned ${users.length} user accounts.`);
  console.log(`Found ${legacy.length} still on the legacy unsalted-SHA-256 hash.`);

  if (legacy.length) {
    console.log("\nEach of these will auto-upgrade to scrypt on its own next successful login.");
    console.log("For any that won't log in soon, force a password reset instead of waiting:\n");
    for (const user of legacy) {
      console.log(`  id=${user.id}  email=${user.email}  tenantId=${user.tenantId}  platformAdmin=${Boolean(user.isPlatformAdmin)}  lastLoginAt=${user.lastLoginAt || "(never recorded)"}`);
    }
  }
} finally {
  await prisma.$disconnect();
}
