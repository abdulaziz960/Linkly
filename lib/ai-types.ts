export const aiProviders = ["gemini", "openai", "openrouter", "deepseek"] as const;
export type AiProvider = typeof aiProviders[number];
export const aiOperations = ["reply", "rewrite", "correct", "translate", "summarize", "sentiment", "next_step"] as const;
export type AiOperation = typeof aiOperations[number];
export type AiSettingsPublic = {
  provider: AiProvider; model: string; enabled: boolean; hasKey: boolean; prompt: string;
  dailyLimit: number; monthlyLimit: number; inputRate: number | null; outputRate: number | null;
  // Whether this tenant's current plan includes the Linkly-managed AI
  // Copilot (a positive daily limit on the Plan row), whether a platform
  // key has actually been connected yet, and that plan's own limits - used
  // to offer a no-key-required toggle instead of requiring bring-your-own-key.
  managedAvailable: boolean; managedReady: boolean; managedDailyLimit: number; managedMonthlyLimit: number;
};
