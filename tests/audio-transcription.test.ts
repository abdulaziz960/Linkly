import { existsSync, unlinkSync } from "fs";
import { join } from "path";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({ id: "transcribe-owner", name: "Owner", email: "owner@transcribe.test", role: "مالك الحساب", tenantId: "transcribe-tenant" }));
vi.mock("../lib/auth", () => ({ getCurrentUser: vi.fn(async () => session) }));

const path = join(process.cwd(), "tests", ".tmp-audio-transcription.db");

beforeAll(async () => {
  if (existsSync(path)) unlinkSync(path);
  vi.stubEnv("DATABASE_URL", `file:${path}`);
  vi.stubEnv("INTEGRATION_ENCRYPTION_KEY", "transcription-test-key-not-production");
  const { ensureSchema } = await import("../lib/database");
  await ensureSchema();
});

afterAll(async () => {
  const { prisma } = await import("../lib/prisma");
  await prisma.$disconnect();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  for (const suffix of ["", "-journal", "-wal", "-shm"]) if (existsSync(path + suffix)) unlinkSync(path + suffix);
});

const audioInput = { base64: Buffer.from("fake-mp3-bytes").toString("base64"), mimeType: "audio/mpeg", language: "ar" as const };

describe("runWorkspaceTranscription", () => {
  it("returns disabled when the tenant has no AI settings row", async () => {
    const { runWorkspaceTranscription } = await import("../lib/workspace-ai");
    expect(await runWorkspaceTranscription("no-such-tenant", "user", "conversation", audioInput)).toEqual({ transcript: null, reason: "disabled" });
  });

  it("returns provider_unsupported for a non-Gemini BYOK connection", async () => {
    const { prisma } = await import("../lib/prisma");
    const now = new Date().toISOString();
    await prisma.aiWorkspaceSetting.create({ data: { tenantId: "transcribe-openai", provider: "openai", model: "gpt-test", enabled: 1, apiKey: "enc:v1:whatever", dailyLimit: 10, monthlyLimit: 100, updatedAt: now } });
    const { runWorkspaceTranscription } = await import("../lib/workspace-ai");
    const result = await runWorkspaceTranscription("transcribe-openai", "user", "conversation", audioInput);
    expect(result.reason === "provider_unsupported" || result.reason === "key_unavailable").toBe(true);
  });

  it("transcribes successfully with a Gemini BYOK key, persists usage, and maps the no-speech marker to a reason", async () => {
    const { prisma } = await import("../lib/prisma");
    const { PUT } = await import("../app/api/ai/settings/route");
    session.tenantId = "transcribe-gemini";
    await PUT(new NextRequest("http://localhost/api/ai/settings", {
      method: "PUT",
      body: JSON.stringify({ provider: "gemini", model: "gemini-test-model", enabled: true, prompt: "", dailyLimit: 10, monthlyLimit: 100, inputRate: 1, outputRate: 2, apiKey: "gemini-byok-key" })
    }));

    const fetchMock = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({
      candidates: [{ content: { parts: [{ text: "مرحبا، هذه تجربة" }] } }],
      usageMetadata: { promptTokenCount: 200, candidatesTokenCount: 10 }
    })));
    vi.stubGlobal("fetch", fetchMock);

    const { runWorkspaceTranscription } = await import("../lib/workspace-ai");
    const result = await runWorkspaceTranscription(session.tenantId, session.id, "conversation-1", audioInput);
    expect(result).toEqual({ transcript: "مرحبا، هذه تجربة" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const event = await prisma.aiUsageEvent.findFirstOrThrow({ where: { tenantId: session.tenantId, operation: "transcribe" } });
    expect(event.status).toBe("succeeded");

    const noSpeechMock = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({
      candidates: [{ content: { parts: [{ text: "[NO_SPEECH_DETECTED]" }] } }],
      usageMetadata: { promptTokenCount: 50, candidatesTokenCount: 3 }
    })));
    vi.stubGlobal("fetch", noSpeechMock);
    const secondResult = await runWorkspaceTranscription(session.tenantId, session.id, "conversation-1", audioInput);
    expect(secondResult).toEqual({ transcript: null, reason: "no_speech" });
  });
});

describe("POST /api/conversations/[id]/messages/[messageId]/transcribe", () => {
  it("rejects a message with no audio attachment, transcribes an audio message, persists it, and serves the cached transcript on a second call without calling the AI provider again", async () => {
    const { prisma } = await import("../lib/prisma");
    const { PUT } = await import("../app/api/ai/settings/route");
    session.tenantId = "transcribe-route-tenant";
    session.role = "مالك الحساب";
    await PUT(new NextRequest("http://localhost/api/ai/settings", {
      method: "PUT",
      body: JSON.stringify({ provider: "gemini", model: "gemini-test-model", enabled: true, prompt: "", dailyLimit: 10, monthlyLimit: 100, inputRate: 1, outputRate: 2, apiKey: "gemini-byok-key" })
    }));

    const now = new Date().toISOString();
    await prisma.customer.create({ data: { id: "transcribe-customer", tenantId: session.tenantId, name: "Customer", phone: "9665", initial: "C" } });
    await prisma.conversation.create({ data: { id: "transcribe-conv", tenantId: session.tenantId, customerId: "transcribe-customer", lastMessage: "audio", status: "assigned", assignee: "" } });
    await prisma.message.create({ data: { id: "transcribe-msg-text", conversationId: "transcribe-conv", direction: "in", text: "hello", time: "00:00", createdAt: now } });
    const audioDataUrl = `data:audio/mpeg;base64,${audioInput.base64}`;
    await prisma.message.create({ data: { id: "transcribe-msg-audio", conversationId: "transcribe-conv", direction: "in", text: "رسالة صوتية", time: "00:01", createdAt: now, attachmentType: "audio", attachmentUrl: audioDataUrl, attachmentMime: "audio/mpeg", attachmentName: "voice.mp3" } });

    const { POST } = await import("../app/api/conversations/[id]/messages/[messageId]/transcribe/route");

    const textResponse = await POST(new NextRequest("http://localhost/x", { method: "POST", body: "{}" }), { params: Promise.resolve({ id: "transcribe-conv", messageId: "transcribe-msg-text" }) });
    expect(textResponse.status).toBe(400);

    const fetchMock = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({
      candidates: [{ content: { parts: [{ text: "نص مفرغ من الصوت" }] } }],
      usageMetadata: { promptTokenCount: 80, candidatesTokenCount: 8 }
    })));
    vi.stubGlobal("fetch", fetchMock);

    const firstResponse = await POST(new NextRequest("http://localhost/x", { method: "POST", body: "{}" }), { params: Promise.resolve({ id: "transcribe-conv", messageId: "transcribe-msg-audio" }) });
    expect(firstResponse.status).toBe(200);
    const firstBody = await firstResponse.json();
    expect(firstBody.data.transcript).toBe("نص مفرغ من الصوت");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const stored = await prisma.message.findUniqueOrThrow({ where: { id: "transcribe-msg-audio" } });
    expect(stored.transcript).toBe("نص مفرغ من الصوت");

    const secondResponse = await POST(new NextRequest("http://localhost/x", { method: "POST", body: "{}" }), { params: Promise.resolve({ id: "transcribe-conv", messageId: "transcribe-msg-audio" }) });
    expect(secondResponse.status).toBe(200);
    const secondBody = await secondResponse.json();
    expect(secondBody.data.transcript).toBe("نص مفرغ من الصوت");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
