import type { IntegrationSettings } from "../app/dashboard/types";

function env(name: string) {
  return process.env[name]?.trim() || "";
}

export function getXPlatformCredentials(settings?: Partial<IntegrationSettings>) {
  return {
    clientId: env("X_CLIENT_ID") || settings?.appId?.trim() || "",
    clientSecret: env("X_CLIENT_SECRET") || settings?.configId?.trim() || "",
    consumerKey: env("X_CONSUMER_KEY") || settings?.xConsumerKey?.trim() || "",
    consumerSecret: env("X_CONSUMER_SECRET") || settings?.xConsumerSecret?.trim() || "",
    bearerToken: env("X_BEARER_TOKEN") || settings?.xBearerToken?.trim() || ""
  };
}

export function hasCentralXAppCredentials() {
  return Boolean(env("X_CLIENT_ID") && env("X_CLIENT_SECRET"));
}
