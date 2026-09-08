import { afterEach, describe, expect, it, vi } from "vitest";

describe("ai-provider", () => {
  it.each(["openai", "openrouter", "deepseek"] as const)("uses the %s adapter and captures usage", async (provider) => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: "Draft" } }], usage: { prompt_tokens: 12, completion_tokens: 4 } })));
    vi.stubGlobal("fetch", fetchMock);
    const { generateAiText } = await import("../lib/ai-provider");
    expect(await generateAiText({ provider, model: "test-model", apiKey: "test-key" }, { messages: [{ direction: "in", text: "Hi" }], customerName: "Customer", language: "en" })).toEqual({ text: "Draft", inputTokens: 12, outputTokens: 4 });
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining(provider === "deepseek" ? "api.deepseek.com" : provider === "openrouter" ? "openrouter.ai" : "api.openai.com"), expect.objectContaining({ headers: expect.objectContaining({ Authorization: "Bearer test-key" }) }));
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("isAiReplyConfigured() is false without a key, true with one", async () => {
    vi.stubEnv("GEMINI_API_KEY", "");
    let mod = await import("../lib/ai-provider");
    expect(mod.isAiReplyConfigured()).toBe(false);

    vi.resetModules();
    vi.stubEnv("GEMINI_API_KEY", "test-key");
    mod = await import("../lib/ai-provider");
    expect(mod.isAiReplyConfigured()).toBe(true);
  });

  it("suggestReply() returns null without a key, without ever calling fetch", async () => {
    vi.stubEnv("GEMINI_API_KEY", "");
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const { suggestReply } = await import("../lib/ai-provider");

    const result = await suggestReply({ messages: [{ direction: "in", text: "مرحباً" }], customerName: "عميل", language: "ar" });
    expect(result).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("suggestReply() returns null (not a throw) when the provider call fails", async () => {
    vi.stubEnv("GEMINI_API_KEY", "test-key");
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("network down"); }));
    const { suggestReply } = await import("../lib/ai-provider");

    const result = await suggestReply({ messages: [{ direction: "in", text: "مرحباً" }], customerName: "عميل", language: "ar" });
    expect(result).toBeNull();
  });

  it("suggestReply() returns null when the response has no candidates", async () => {
    vi.stubEnv("GEMINI_API_KEY", "test-key");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({}), { status: 200 })));
    const { suggestReply } = await import("../lib/ai-provider");

    const result = await suggestReply({ messages: [{ direction: "in", text: "مرحباً" }], customerName: "عميل", language: "ar" });
    expect(result).toBeNull();
  });

  it("suggestReply() returns the generated text on a successful call", async () => {
    vi.stubEnv("GEMINI_API_KEY", "test-key");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      candidates: [{ content: { parts: [{ text: "أهلاً، كيف أقدر أساعدك؟" }] } }]
    }), { status: 200 })));
    const { suggestReply } = await import("../lib/ai-provider");

    const result = await suggestReply({ messages: [{ direction: "in", text: "مرحباً" }], customerName: "عميل", language: "ar" });
    expect(result).toBe("أهلاً، كيف أقدر أساعدك؟");
  });
});
