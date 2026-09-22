import { afterEach, describe, expect, it, vi } from "vitest";

describe("ai-provider", () => {
  it.each(["reply", "rewrite", "correct", "translate", "summarize", "sentiment", "next_step"] as const)("supports the %s employee tool locally", async (operation) => {
    vi.stubEnv("OLLAMA_BASE_URL", "http://localhost:11434");
    const fetchMock = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ done: true, message: { content: "نتيجة للمراجعة" }, prompt_eval_count: 8, eval_count: 3 })));
    vi.stubGlobal("fetch", fetchMock);
    const { generateAiText } = await import("../lib/ai-provider");
    expect(await generateAiText({ provider: "ollama", model: "local-test", apiKey: "" }, { source: "copilot", operation, messages: [{ direction: "in", text: "طلب تجريبي" }], draft: "مسودة", customerName: "", language: "ar" })).toEqual({ text: "نتيجة للمراجعة", inputTokens: 8, outputTokens: 3 });
    const body = JSON.parse(fetchMock.mock.calls[0][1]?.body as string);
    expect(body.messages[0].content).toContain("Output language: Arabic");
    expect(body.tools).toBeUndefined();
  });
  it("does not select Gemini for an invalid managed provider value", async () => {
    vi.stubEnv("AI_MANAGED_PROVIDER", "ollamaa");
    vi.stubEnv("GEMINI_API_KEY", "paid-key");
    const { isAiReplyConfigured } = await import("../lib/ai-provider");
    expect(isAiReplyConfigured()).toBe(false);
  });
  it("uses the local chat API without a key, excludes notes and captures token usage", async () => {
    vi.stubEnv("AI_MANAGED_PROVIDER", "ollama");
    vi.stubEnv("OLLAMA_BASE_URL", "http://127.0.0.1:11434");
    vi.stubEnv("OLLAMA_MODEL", "test-local:4b");
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ done: true, message: { content: "  أهلاً بك  " }, prompt_eval_count: 12, eval_count: 4 })));
    vi.stubGlobal("fetch", fetchMock);
    const { suggestReply, isAiReplyConfigured } = await import("../lib/ai-provider");
    expect(isAiReplyConfigured()).toBe(true);
    expect(await suggestReply({ source: "copilot", messages: [{ direction: "in", text: "مرحباً" }, { direction: "note", text: "PRIVATE_NOTE" }], customerName: "عميل", language: "ar" })).toBe("أهلاً بك");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("http://127.0.0.1:11434/api/chat");
    expect(init.redirect).toBe("error");
    expect(init.headers).not.toHaveProperty("Authorization");
    expect(init.body).not.toContain("PRIVATE_NOTE");
    expect(JSON.parse(init.body as string)).toMatchObject({ model: "test-local:4b", stream: false, think: false, options: { num_predict: 1024 } });
  });

  it.each(["https://ollama.com", "http://169.254.169.254", "http://example.com", "http://localhost/api", "http://user:pass@localhost", "http://localhost?key=1"])("rejects unsafe or non-local origin %s", async (url) => {
    vi.stubEnv("OLLAMA_BASE_URL", url);
    const { localAiEndpoint } = await import("../lib/ai-provider");
    expect(localAiEndpoint()).toBeNull();
  });

  it.each(["http://localhost:11434", "https://10.0.0.5", "http://192.168.1.2:11434", "http://[::1]:11434"])("accepts an operator-configured private origin %s", async (url) => {
    vi.stubEnv("OLLAMA_BASE_URL", url);
    const { localAiEndpoint } = await import("../lib/ai-provider");
    expect(localAiEndpoint()).toBe(`${url}/api/chat`);
  });

  it.each(["", "test:cloud"])("fails closed for unconfigured or cloud model %s even with a Gemini key", async (model) => {
    vi.stubEnv("AI_MANAGED_PROVIDER", "ollama");
    vi.stubEnv("OLLAMA_BASE_URL", "http://localhost:11434");
    vi.stubEnv("OLLAMA_MODEL", model);
    vi.stubEnv("GEMINI_API_KEY", "paid-key-must-not-be-used");
    const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
    const { suggestReply, isAiReplyConfigured } = await import("../lib/ai-provider");
    expect(isAiReplyConfigured()).toBe(false);
    expect(await suggestReply({ source: "copilot", messages: [], draft: "Hello", customerName: "", language: "en" })).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not fall back to paid cloud after local failure or run local automated replies", async () => {
    vi.stubEnv("AI_MANAGED_PROVIDER", "ollama");
    vi.stubEnv("OLLAMA_BASE_URL", "http://localhost:11434");
    vi.stubEnv("OLLAMA_MODEL", "test-local");
    vi.stubEnv("GEMINI_API_KEY", "paid-key-must-not-be-used");
    const fetchMock = vi.fn<typeof fetch>(async () => new Response("busy", { status: 429 })); vi.stubGlobal("fetch", fetchMock);
    const { suggestReply } = await import("../lib/ai-provider");
    const context = { messages: [], draft: "Hello", customerName: "", language: "en" as const };
    expect(await suggestReply(context)).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(await suggestReply({ ...context, source: "copilot" })).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe("http://localhost:11434/api/chat");
  });
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
