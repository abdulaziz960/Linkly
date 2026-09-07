// AI-suggested replies for the inbox composer. Gemini is the first (and
// currently only) provider wired in - written so a sibling function behind
// the same suggestReply() signature can add OpenAI/OpenRouter/DeepSeek
// later without touching call sites, but that abstraction isn't built
// until a second provider is actually needed.

export type SuggestReplyMessage = { direction: "in" | "out" | "note"; text: string };

export function isAiReplyConfigured(): boolean {
  return Boolean(process.env.GEMINI_API_KEY?.trim());
}

const geminiModel = "gemini-2.0-flash";

function buildPrompt(messages: SuggestReplyMessage[], customerName: string, language: "ar" | "en") {
  const transcript = messages
    .filter((message) => message.direction !== "note")
    .slice(-10)
    .map((message) => `${message.direction === "in" ? customerName : "الفريق"}: ${message.text}`)
    .join("\n");

  const instruction = language === "en"
    ? `You are a customer-support agent for a WhatsApp/social inbox SaaS called Linkly. Draft ONE short, natural reply (in English) to the customer's latest message below, continuing the conversation. Reply with only the message text, no quotes, no explanation.`
    : `أنت موظف دعم عملاء في منصة Linkly لإدارة محادثات واتساب والقنوات الاجتماعية. اكتب ردًا واحدًا قصيرًا وطبيعيًا بالعربية على آخر رسالة من العميل أدناه، يكمل سياق المحادثة. اكتب نص الرد فقط، بدون علامات اقتباس أو شرح.`;

  return `${instruction}\n\n${transcript}`;
}

/**
 * Never throws - returns null on any failure (missing key, network error,
 * empty/blocked response) so a flaky AI call can never block an agent from
 * sending a real message. The caller must treat null as "no suggestion
 * available", not as an error to surface loudly.
 */
export async function suggestReply(context: { messages: SuggestReplyMessage[]; customerName: string; language: "ar" | "en" }): Promise<string | null> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) return null;
  if (!context.messages.length) return null;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: buildPrompt(context.messages, context.customerName, context.language) }] }],
          generationConfig: { maxOutputTokens: 200, temperature: 0.6 }
        })
      }
    );
    if (!response.ok) {
      console.error("Gemini suggestReply call failed", response.status, await response.text().catch(() => ""));
      return null;
    }

    const payload = await response.json().catch(() => null) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    } | null;
    const text = payload?.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("").trim();
    if (!text) console.error("Gemini suggestReply returned no text", JSON.stringify(payload));
    return text || null;
  } catch (error) {
    console.error("Gemini suggestReply threw", error);
    return null;
  }
}
