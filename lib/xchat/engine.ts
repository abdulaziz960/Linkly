// X Chat (end-to-end encrypted DMs): the cryptography. Wraps X's own Chat XDK, whose WASM engine is the only part we
// use - it never touches the network; lib/xchat/api.ts talks to X. The package's public entry point stores private keys
// only in a PIN-protected cloud vault (Juicebox), which a server cannot use, so this loads the package's own `Chat`
// engine directly: it can export/import the private keys as a 64-byte blob that we keep encrypted in our database.
// The package version is pinned in package.json because this reaches inside it.

import { readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

export type XChatRegistration = {
  publicKey: {
    identityPublicKeySignature: string;
    publicKey: string;
    publicKeyFingerprint?: string;
    registrationMethod: string;
    signingPublicKey: string;
    signingPublicKeySignature?: string;
  };
  version?: string;
  generateVersion: boolean;
};

export type XChatKeyInput = { userId: string; publicKey: string; keyVersion: string };

export type XChatSigningKey = {
  userId: string;
  publicKeyVersion: string;
  publicKey: string;
  identityPublicKey: string;
  identityPublicKeySignature: string;
};

export type XChatPreparedKeyChange = {
  conversationId: string;
  conversationKey: Uint8Array;
  conversationKeyVersion: string;
  participantKeys: Array<{ userId: string; encryptedKey: string; publicKeyVersion: string }>;
  actionSignatures: Array<{ messageId: string; encodedMessageEventDetail: string; signature: string; signatureVersion: string; publicKeyVersion: string }>;
};

export type XChatSendPayload = {
  messageId: string;
  encryptedContent: string;
  signature: string;
  encodedEventSignature: string;
  signatureInfo: { publicKeyVersion: string; signatureVersion: string };
  conversationKeyVersion: string;
  shouldNotify: boolean;
};

export type XChatDecryptedEvent = {
  type: string;
  sender_id?: string;
  senderId?: string;
  conversation_id?: string;
  conversationId?: string;
  message_id?: string;
  messageId?: string;
  content?: { text?: string };
  [key: string]: unknown;
};

/** The subset of the engine's `Chat` class that we call (see the package's index.d.ts for the full list). */
export interface XChatEngine {
  setRejectUnverified(reject: boolean): void;
  generateKeypairs(): XChatRegistration;
  setIdentity(userId: string, signingKeyVersion: string): void;
  setCacheKeys(enabled: boolean): void;
  setSigningKeys(keys: XChatSigningKey[]): void;
  importKeys(keys: Uint8Array, version?: string): void;
  exportKeys(): Uint8Array;
  getPublicKeys(): { identity: string; signing: string; version: string };
  decryptConversationKey(encryptedKeyB64: string): Uint8Array;
  extractConversationKeys(events: string[]): { keys: Record<string, Uint8Array>; latestVersion: string | null };
  decryptEvents(events: string[], signingKeys?: XChatSigningKey[]): { messages: Array<{ event: XChatDecryptedEvent; originalB64?: string }>; conversationKeys: { keys: Record<string, Uint8Array>; latestVersion: string | null }; errors: Record<string, string> };
  decryptEvent(eventB64: string, conversationKeys?: Record<string, Uint8Array> | null, signingKeys?: XChatSigningKey[]): XChatDecryptedEvent;
  verifyKeyBinding(identityPublicKeyB64: string, signingPublicKeyB64: string, identityPublicKeySignatureB64: string): boolean;
  encryptMessage(params: { conversationId: string; text: string; conversationKey?: Uint8Array | null; conversationKeyVersion?: string | null; shouldNotify?: boolean | null }): XChatSendPayload;
  prepareConversationKeyChange(params: { publicKeys: XChatKeyInput[]; conversationId?: string | null }): XChatPreparedKeyChange;
  free(): void;
}

type EngineModule = { Chat: new () => XChatEngine };

let modulePromise: Promise<EngineModule> | null = null;

/** Where the package's WASM engine lives: next to the app's node_modules (the Docker image copies it there). */
function packageDir() {
  return path.join(process.cwd(), "node_modules", "@xdevplatform", "chat-xdk", "pkg");
}

function loadModule(): Promise<EngineModule> {
  modulePromise ??= (async () => {
    const dir = packageDir();
    // A runtime import by file URL: the bundler must not try to resolve (or tree-shake) this internal file.
    const loaded = (await import(/* webpackIgnore: true */ pathToFileURL(path.join(dir, "chat_xdk_wasm.js")).href)) as EngineModule & { default: (options: { module_or_path: Uint8Array }) => Promise<unknown> };
    await loaded.default({ module_or_path: readFileSync(path.join(dir, "chat_xdk_wasm_bg.wasm")) });
    return loaded;
  })().catch((error) => {
    modulePromise = null;
    throw error;
  });
  return modulePromise;
}

/** A fresh engine with no keys. Call `.free()` when done. */
export async function createEngine(): Promise<XChatEngine> {
  const { Chat } = await loadModule();
  return new Chat();
}

/** An engine holding a workspace's saved private keys, signing as its X account. */
export async function engineFromKeys(params: { keys: Uint8Array; keyVersion: string; userId: string }): Promise<XChatEngine> {
  const engine = await createEngine();
  engine.importKeys(params.keys, params.keyVersion);
  engine.setIdentity(params.userId, params.keyVersion);
  engine.setCacheKeys(true);
  return engine;
}

/** First-time setup for an account: new private keys and the public half to register with X. */
export async function generateAccountKeys(): Promise<{ registration: XChatRegistration; privateKeys: Uint8Array }> {
  const engine = await createEngine();
  try {
    const registration = engine.generateKeypairs();
    return { registration, privateKeys: engine.exportKeys() };
  } finally {
    engine.free();
  }
}
