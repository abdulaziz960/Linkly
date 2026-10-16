// The X Chat HTTP endpoints (https://docs.x.com/xchat). Plain requests with the workspace's existing X login
// (OAuth 2.0 user token, auto-refreshed); the cryptography is in lib/xchat/engine.ts.

import type { IntegrationSettings } from "../../app/dashboard/types";
import { fetchXWithAutoRefresh, getXApiErrorMessage, XApiError } from "../x-api";
import type { XChatRegistration, XChatSigningKey } from "./engine";

const BASE = "https://api.x.com/2";

type Json = Record<string, unknown>;

async function call<T>(settings: IntegrationSettings, path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetchXWithAutoRefresh(settings, `${BASE}${path}`, {
    ...init,
    headers: { ...(init.body ? { "Content-Type": "application/json" } : {}), ...(init.headers || {}) }
  });
  const payload = (await response.json().catch(() => null)) as (Json & { detail?: string; title?: string; errors?: Array<{ detail?: string; message?: string }> }) | null;
  if (!response.ok) {
    throw new XApiError(`${getXApiErrorMessage(payload, "تعذر الاتصال بخدمة محادثات X المشفّرة")} (${response.status})`, response.status || 502);
  }
  return (payload ?? {}) as T;
}

export type XPublicKeyRecord = {
  public_key_version?: string;
  public_key?: string;
  signing_public_key?: string;
  identity_public_key_signature?: string;
};

export async function getUserPublicKeys(settings: IntegrationSettings, userId: string): Promise<XPublicKeyRecord[]> {
  const fields = "public_key_version,public_key,signing_public_key,identity_public_key_signature";
  const result = await call<{ data?: XPublicKeyRecord[] }>(settings, `/users/${encodeURIComponent(userId)}/public_keys?public_key.fields=${fields}`);
  return result.data ?? [];
}

/** The signing-key entry the engine needs to verify a participant's messages. */
export function toSigningKey(userId: string, record: XPublicKeyRecord): XChatSigningKey | null {
  if (!record.public_key_version || !record.public_key || !record.signing_public_key || !record.identity_public_key_signature) return null;
  return {
    userId,
    publicKeyVersion: String(record.public_key_version),
    publicKey: record.signing_public_key,
    identityPublicKey: record.public_key,
    identityPublicKeySignature: record.identity_public_key_signature
  };
}

/** Registers a freshly generated key pair as the account's X Chat key. Returns the version X assigned. */
export async function registerPublicKey(settings: IntegrationSettings, userId: string, registration: XChatRegistration): Promise<string> {
  const pk = registration.publicKey;
  const result = await call<{ data?: { public_key_version?: string } }>(settings, `/users/${encodeURIComponent(userId)}/public_keys`, {
    method: "POST",
    body: JSON.stringify({
      public_key: {
        identity_public_key_signature: pk.identityPublicKeySignature,
        public_key: pk.publicKey,
        public_key_fingerprint: pk.publicKeyFingerprint,
        registration_method: pk.registrationMethod,
        signing_public_key: pk.signingPublicKey,
        signing_public_key_signature: pk.signingPublicKeySignature
      },
      version: registration.version,
      generate_version: registration.generateVersion
    })
  });
  return String(result.data?.public_key_version || registration.version || "");
}

export type XChatConversation = {
  id?: string;
  type?: string;
  participant_ids?: string[];
  member_ids?: string[];
  newest_event_id?: string;
  updated_at?: string;
};

export async function listConversations(settings: IntegrationSettings): Promise<XChatConversation[]> {
  const fields = "id,type,participant_ids,member_ids,newest_event_id,updated_at";
  const result = await call<{ data?: XChatConversation[] }>(settings, `/chat/conversations?max_results=100&chat_conversation.fields=${fields}`);
  return result.data ?? [];
}

export type XChatEventRecord = {
  id?: string;
  conversation_id?: string;
  conversation_key_version?: string;
  created_at?: string;
  encoded_event?: string;
  sender_id?: string;
};

export async function listConversationEvents(settings: IntegrationSettings, conversationId: string, limit = 50): Promise<{ events: XChatEventRecord[]; keyEvents: string[] }> {
  const fields = "id,conversation_id,conversation_key_version,created_at,encoded_event,sender_id";
  const result = await call<{ data?: XChatEventRecord[]; meta?: { conversation_key_events?: string[] } }>(
    settings,
    `/chat/conversations/${encodeURIComponent(conversationId)}/events?max_results=${limit}&chat_message_event.fields=${fields}`
  );
  return { events: result.data ?? [], keyEvents: result.meta?.conversation_key_events ?? [] };
}
