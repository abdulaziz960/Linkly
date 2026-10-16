// Turning a workspace's X account into an end-to-end encrypted X Chat participant, and reading its encrypted DMs.
// Everything here is off until the owner enables it: no keys saved means every function returns without calling X.

import { getIntegrationSettings } from "../database";
import { storeXMessage } from "../x-inbox";
import { XApiError } from "../x-api";
import { registerPublicKey, getUserPublicKeys, getXUserName, listConversations, listConversationEvents, toSigningKey } from "./api";
import { engineFromKeys, generateAccountKeys, type XChatSigningKey } from "./engine";
import { getXChatKeys, getXChatKeyStatus, saveXChatKeys } from "./keystore";
import { getLastEventId, isNewerId, setLastEventId } from "./state";

const MAX_CONVERSATIONS_PER_RUN = 25;

export type EnableResult = { ok: true; alreadyEnabled: boolean; keyVersion: string } | { ok: false; error: string };

/**
 * One-time setup for the workspace's X account: create the private keys, keep them (encrypted) and register the public
 * half with X. The keys are saved BEFORE the call to X, so a failure there never loses keys X may already hold.
 */
export async function enableXChat(tenantId: string): Promise<EnableResult> {
  const settings = await getIntegrationSettings("x", tenantId);
  const xUserId = settings.wabaId.trim();
  if (settings.status !== "connected" || !xUserId) return { ok: false, error: "اربط حساب X أولًا." };

  const existing = await getXChatKeyStatus(tenantId);
  if (existing.hasKeys && existing.registered) return { ok: true, alreadyEnabled: true, keyVersion: existing.keyVersion };

  const { registration, privateKeys } = await generateAccountKeys();
  await saveXChatKeys({ tenantId, xUserId, keyVersion: registration.version ?? "", privateKeys, registered: false });
  try {
    const version = await registerPublicKey(settings, xUserId, registration);
    await saveXChatKeys({ tenantId, xUserId, keyVersion: version, privateKeys, registered: true });
    return { ok: true, alreadyEnabled: false, keyVersion: version };
  } catch (error) {
    const message = error instanceof XApiError ? error.message : error instanceof Error ? error.message : "تعذر تسجيل مفاتيح التشفير عند X.";
    return { ok: false, error: message };
  }
}

export type XChatSyncResult = {
  ok: boolean;
  skipped?: string;
  conversations: number;
  stored: number;
  undecryptable: number;
  errors: string[];
};

/** Reads the workspace's encrypted conversations from X, decrypts them and stores the customers' new messages. */
export async function syncXChatForTenant(tenantId: string): Promise<XChatSyncResult> {
  const result: XChatSyncResult = { ok: true, conversations: 0, stored: 0, undecryptable: 0, errors: [] };
  const keys = await getXChatKeys(tenantId);
  if (!keys || !keys.registered) return { ...result, skipped: "not-enabled" };

  const settings = await getIntegrationSettings("x", tenantId);
  const ownUserId = settings.wabaId.trim();
  if (settings.status !== "connected" || !ownUserId) return { ...result, skipped: "x-not-connected" };

  const engine = await engineFromKeys({ keys: keys.privateKeys, keyVersion: keys.keyVersion, userId: ownUserId });
  const signingKeys = new Map<string, XChatSigningKey[]>();
  const signingKeysFor = async (userId: string) => {
    if (!signingKeys.has(userId)) {
      const records = await getUserPublicKeys(settings, userId).catch(() => []);
      signingKeys.set(userId, records.map((record) => toSigningKey(userId, record)).filter((entry): entry is XChatSigningKey => Boolean(entry)));
    }
    return signingKeys.get(userId) ?? [];
  };

  const names = new Map<string, string | undefined>();
  const nameFor = async (userId: string) => {
    if (!names.has(userId)) names.set(userId, await getXUserName(settings, userId).catch(() => undefined));
    return names.get(userId);
  };

  try {
    const conversations = (await listConversations(settings))
      // Groups (ids start with "g") are not supported yet.
      .filter((conversation) => conversation.id && !conversation.id.startsWith("g"))
      .slice(0, MAX_CONVERSATIONS_PER_RUN);
    result.conversations = conversations.length;

    for (const conversation of conversations) {
      const conversationId = String(conversation.id);
      const watermark = await getLastEventId(tenantId, conversationId);
      if (watermark && conversation.newest_event_id && !isNewerId(conversation.newest_event_id, watermark)) continue;

      const participants = (conversation.participant_ids?.length ? conversation.participant_ids : conversationId.split("-")).map(String);
      const { events, keyEvents } = await listConversationEvents(settings, conversationId);
      const ordered = [...events].reverse().filter((event) => event.encoded_event);
      const allSigningKeys = (await Promise.all(participants.map((participant) => signingKeysFor(participant)))).flat();

      const decrypted = engine.decryptEvents([...keyEvents, ...ordered.map((event) => String(event.encoded_event))], allSigningKeys);
      result.undecryptable += Object.keys(decrypted.errors).length;
      for (const [index, message] of Object.entries(decrypted.errors).slice(0, 3)) result.errors.push(`${conversationId}#${index}: ${message}`);

      let newest = watermark;
      for (const { event } of decrypted.messages) {
        const eventId = String(event.id ?? "");
        if (event.type !== "message" || event.content?.contentType !== "text" || !event.content.text?.trim()) continue;
        if (!eventId || !isNewerId(eventId, watermark)) continue;
        if (isNewerId(eventId, newest)) newest = eventId;
        const senderId = String(event.senderId ?? "");
        if (!senderId || senderId === ownUserId) continue;
        await storeXMessage({
          tenantId,
          xUserId: senderId,
          name: await nameFor(senderId),
          text: event.content.text.trim(),
          direction: "in",
          messageId: `chat-${eventId}`,
          receivedAt: typeof event.createdAtMsec === "number" ? new Date(event.createdAtMsec) : new Date(),
          source: { type: "x_dm", id: conversationId }
        });
        result.stored += 1;
      }
      if (newest && newest !== watermark) await setLastEventId(tenantId, conversationId, newest);
    }
  } catch (error) {
    result.ok = false;
    result.errors.push(error instanceof Error ? error.message : "خطأ غير معروف في مزامنة المحادثات المشفّرة");
  } finally {
    engine.free();
  }
  return result;
}

