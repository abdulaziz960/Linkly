import { prisma } from "./prisma";
import { sendBotText, isBotChannel, type BotChannel } from "./bot-engine";

const RATING_AUTHOR = "نظام التقييم";
const RATING_REQUEST_TEXT = "شكرًا لتواصلك معنا! تقييمك يهمنا - قيّم خدمة الموظف من 1 إلى 5 بالرد برقم واحد.";
const RATING_THANKS_TEXT = "شكرًا لتقييمك!";

const ARABIC_INDIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";

function parseRatingReply(text: string): number | null {
  const normalized = text
    .trim()
    .replace(/[٠-٩]/g, (digit) => String(ARABIC_INDIC_DIGITS.indexOf(digit)));
  const match = normalized.match(/^([1-5])$/);
  return match ? Number(match[1]) : null;
}

// Fires once, right when an employee (not the bot) closes a conversation -
// asks the customer to rate the handling employee from 1 to 5. Skipped for
// conversations nobody was actually assigned to (the bot closing its own
// flow without a handoff) and for channels we have no way to message back
// on (email/SMS/TikTok/Google Maps aren't wired into sendBotText).
export async function requestRatingIfNeeded(conversationId: string, tenantId: string) {
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: { customer: true }
  });
  if (!conversation) return;
  if (!conversation.assignee || conversation.assignee === "بدون موظف") return;
  if (conversation.ratingRequestedAt) return;
  if (!isBotChannel(conversation.channel)) return;

  await sendBotText(conversation.channel as BotChannel, {
    tenantId,
    conversationId,
    recipientId: conversation.customer.phone,
    text: RATING_REQUEST_TEXT,
    author: RATING_AUTHOR
  }).catch((error) => {
    console.error(`Failed to send rating request for conversation ${conversationId}`, error);
  });

  await prisma.conversation.update({
    where: { id: conversationId },
    data: { ratingRequestedAt: new Date().toISOString() }
  });
}

// Checked on every inbound message before the bot's own restart-on-reply
// logic runs - a bare 1-5 reply to a pending rating request is recorded as
// the rating instead of being treated as a fresh message to the bot. Plain
// prisma (no transaction): it runs before each inbox file's own
// customer/conversation transaction, and does no network I/O itself, so
// there's nothing here that needs transactional atomicity with the message
// write that follows.
export async function maybeRecordRatingReply(conversationId: string, text: string): Promise<boolean> {
  const rating = parseRatingReply(text);
  if (rating === null) return false;

  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: { status: true, ratingRequestedAt: true, ratingAt: true, assignee: true }
  });
  if (!conversation || conversation.status !== "closed") return false;
  if (!conversation.ratingRequestedAt || conversation.ratingAt) return false;

  await prisma.conversation.update({
    where: { id: conversationId },
    data: { rating, ratingEmployee: conversation.assignee, ratingAt: new Date().toISOString() }
  });

  return true;
}

// Called after the message-storing transaction commits (never inside it -
// this makes a real network call to the channel API).
export async function sendRatingThanks(conversationId: string) {
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: { customer: true }
  });
  if (!conversation || !isBotChannel(conversation.channel)) return;

  await sendBotText(conversation.channel as BotChannel, {
    tenantId: conversation.tenantId,
    conversationId,
    recipientId: conversation.customer.phone,
    text: RATING_THANKS_TEXT,
    author: RATING_AUTHOR
  }).catch((error) => {
    console.error(`Failed to send rating thanks for conversation ${conversationId}`, error);
  });
}
