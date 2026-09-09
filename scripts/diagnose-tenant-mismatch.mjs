// Read-only diagnostic: finds Conversation rows whose tenantId doesn't match
// their own linked Customer's tenantId. Such a conversation is correctly
// reachable through the customer (e.g. Contacts, which joins without a
// tenantId filter on the conversation side) but invisible to every
// Inbox/Kanban/Reports query, which all filter conversations by tenantId
// directly - for every role, including the account owner.
//
// Run against production with:
//   DATABASE_URL="<postgres connection string>" node scripts/prisma-generate.mjs
//   DATABASE_URL="<postgres connection string>" node scripts/diagnose-tenant-mismatch.mjs
// Makes no writes - safe to run repeatedly.

if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = "file:./dev.db";
}

const { PrismaClient } = await import("@prisma/client");
const prisma = new PrismaClient();

try {
  const conversations = await prisma.conversation.findMany({
    select: {
      id: true,
      tenantId: true,
      channel: true,
      assignee: true,
      customer: { select: { id: true, name: true, tenantId: true } }
    }
  });

  const mismatched = conversations.filter((conversation) => conversation.customer && conversation.customer.tenantId !== conversation.tenantId);

  console.log(`Scanned ${conversations.length} conversations.`);
  console.log(`Found ${mismatched.length} with a tenantId that does not match their own customer's tenantId.`);

  if (mismatched.length) {
    const byPair = new Map();
    for (const conversation of mismatched) {
      const key = `${conversation.tenantId} -> ${conversation.customer.tenantId}`;
      byPair.set(key, (byPair.get(key) || 0) + 1);
    }

    console.log("\nBreakdown by (conversation.tenantId -> customer.tenantId):");
    for (const [pair, count] of byPair) {
      console.log(`  ${count}x  ${pair}`);
    }

    console.log("\nSample (up to 20 rows):");
    for (const conversation of mismatched.slice(0, 20)) {
      console.log(`  conversation=${conversation.id}  channel=${conversation.channel}  assignee=${conversation.assignee}  conv.tenantId=${conversation.tenantId}  customer.tenantId=${conversation.customer.tenantId}  customer=${conversation.customer.name}`);
    }
  }
} finally {
  await prisma.$disconnect();
}
