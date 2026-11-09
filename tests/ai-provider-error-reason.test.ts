import { afterEach, describe, expect, it, vi } from "vitest";
import { generateAiText } from "../lib/ai-provider";

afterEach(() => vi.restoreAllMocks());

describe("a refused AI request says why", () => {
  it("logs the provider's own message and the model, never the key", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ error: { message: "Model Not Exist" } }), { status: 400 }));
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const result = await generateAiText(
      { provider: "deepseek", model: "deepseek-chta", apiKey: "sk-secret-key-123", enabled: true } as never,
      { messages: [{ direction: "in", text: "hi", author: "c" }], customerName: "c", language: "ar" } as never
    );
    expect(result).toBeNull();
    const [, details] = logged.mock.calls[0];
    expect(details).toMatchObject({ provider: "deepseek", model: "deepseek-chta", status: 400, reason: "Model Not Exist" });
    expect(JSON.stringify(logged.mock.calls)).not.toContain("sk-secret-key-123");
  });
});
