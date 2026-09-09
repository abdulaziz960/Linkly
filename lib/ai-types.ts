export const aiProviders = ["gemini", "openai", "openrouter", "deepseek"] as const;
export type AiProvider = typeof aiProviders[number];
export const aiOperations = ["reply", "rewrite", "correct", "translate", "summarize", "sentiment", "next_step"] as const;
export type AiOperation = typeof aiOperations[number];
export type AiSettingsPublic = {
  provider: AiProvider; model: string; enabled: boolean; hasKey: boolean; prompt: string;
  dailyLimit: number; monthlyLimit: number; inputRate: number | null; outputRate: number | null;
};
