import { existsSync, unlinkSync } from "fs";
import { join } from "path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const testDbPath = join(process.cwd(), "tests", ".tmp-xchat-engine.db");

beforeAll(() => {
  if (existsSync(testDbPath)) unlinkSync(testDbPath);
  vi.stubEnv("DATABASE_URL", `file:${testDbPath}`);
  vi.stubEnv("AUTH_SECRET", "test-auth-secret-with-at-least-32-characters");
});

afterAll(async () => {
  const { prisma } = await import("../lib/prisma");
  await prisma.$disconnect();
  for (const suffix of ["", "-journal", "-wal", "-shm"]) {
    const path = `${testDbPath}${suffix}`;
    if (existsSync(path)) unlinkSync(path);
  }
});

describe("X Chat engine (offline: no X account involved)", () => {
  it("generates account keys whose private half exports and imports unchanged", async () => {
    const { generateAccountKeys, engineFromKeys, createEngine } = await import("../lib/xchat/engine");
    const { registration, privateKeys } = await generateAccountKeys();
    expect(registration.generateVersion).toBe(true);
    expect(registration.publicKey.publicKey).toBeTruthy();
    expect(registration.publicKey.signingPublicKey).toBeTruthy();
    expect(privateKeys.length).toBe(64);

    const original = await createEngine();
    original.importKeys(new Uint8Array(privateKeys), "100");
    const restored = await engineFromKeys({ keys: new Uint8Array(privateKeys), keyVersion: "100", userId: "111" });
    expect(restored.getPublicKeys().identity).toBe(original.getPublicKeys().identity);
    original.free();
    restored.free();
  });

  it("two accounts share a conversation key and read each other's encrypted text", async () => {
    const { generateAccountKeys, engineFromKeys } = await import("../lib/xchat/engine");
    const a = await generateAccountKeys();
    const b = await generateAccountKeys();
    const business = await engineFromKeys({ keys: new Uint8Array(a.privateKeys), keyVersion: "100", userId: "111" });
    const customer = await engineFromKeys({ keys: new Uint8Array(b.privateKeys), keyVersion: "200", userId: "222" });

    const prepared = business.prepareConversationKeyChange({
      publicKeys: [
        { userId: "111", publicKey: a.registration.publicKey.publicKey, keyVersion: "100" },
        { userId: "222", publicKey: b.registration.publicKey.publicKey, keyVersion: "200" }
      ]
    });
    expect(prepared.conversationId).toBe("111:222");
    const forCustomer = prepared.participantKeys.find((key) => key.userId === "222")!;
    const customerKey = customer.decryptConversationKey(forCustomer.encryptedKey);
    expect(Buffer.from(customerKey).equals(Buffer.from(prepared.conversationKey))).toBe(true);

    const payload = business.encryptMessage({ conversationId: prepared.conversationId, text: "أهلًا بك", conversationKey: prepared.conversationKey, conversationKeyVersion: prepared.conversationKeyVersion });
    expect(payload.messageId).toBeTruthy();
    expect(payload.encryptedContent).not.toContain("أهلًا");
    business.free();
    customer.free();
  });
});

describe("X Chat key store", () => {
  it("keeps the private keys encrypted at rest and returns them only to the owner workspace", async () => {
    const { prisma } = await import("../lib/prisma");
    const { saveXChatKeys, getXChatKeys, getXChatKeyStatus, markXChatKeysRegistered, deleteXChatKeys } = await import("../lib/xchat/keystore");
    const secret = new Uint8Array(Array.from({ length: 64 }, (_, i) => i + 1));

    await saveXChatKeys({ tenantId: "t-xchat-1", xUserId: "111", keyVersion: "100", privateKeys: secret, registered: false });
    const stored = await prisma.$queryRawUnsafe<Array<{ keys_enc: string }>>("SELECT keys_enc FROM x_chat_keys WHERE tenant_id = 't-xchat-1'");
    expect(stored[0].keys_enc.startsWith("enc:") || stored[0].keys_enc.includes(":")).toBe(true);
    expect(stored[0].keys_enc).not.toContain(Buffer.from(secret).toString("base64"));

    expect(await getXChatKeyStatus("t-xchat-1")).toEqual({ hasKeys: true, registered: false, keyVersion: "100" });
    await markXChatKeysRegistered("t-xchat-1");
    const record = await getXChatKeys("t-xchat-1");
    expect(record?.registered).toBe(true);
    expect(Array.from(record!.privateKeys)).toEqual(Array.from(secret));
    expect(await getXChatKeys("t-xchat-2")).toBeNull();

    await deleteXChatKeys("t-xchat-1");
    expect(await getXChatKeyStatus("t-xchat-1")).toEqual({ hasKeys: false, registered: false, keyVersion: "" });
  });
});
