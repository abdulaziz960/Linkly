import { PrismaClient } from "@prisma/client";

const isProduction = process.env.NODE_ENV === "production";

if (!process.env.DATABASE_URL) {
  if (isProduction) {
    throw new Error("DATABASE_URL is required in production. Configure a persistent database for Linkly before deploying.");
  }

  process.env.DATABASE_URL = "file:./dev.db";
}

if (process.env.DATABASE_URL?.startsWith("postgres")) {
  const databaseUrl = new URL(process.env.DATABASE_URL);
  if (!databaseUrl.searchParams.has("connect_timeout")) {
    databaseUrl.searchParams.set("connect_timeout", "20");
  }
  if (!databaseUrl.searchParams.has("pool_timeout")) {
    databaseUrl.searchParams.set("pool_timeout", "20");
  }
  process.env.DATABASE_URL = databaseUrl.toString();

  // Outside production the app seeds demo fixtures and runs broad schema
  // repair on start-up. Refuse to do that to the production database when it
  // is reachable through the local Cloud SQL proxy (`npm run db:proxy`) or
  // its public IP - e.g. because a production DATABASE_URL was exported in
  // the same terminal that then ran `npm run dev`.
  if (!isProduction && process.env.LINKLY_ALLOW_PRODUCTION_DATABASE !== "1") {
    const hostname = databaseUrl.hostname.replace(/^\[|\]$/g, "");
    const loopback = ["127.0.0.1", "localhost", "::1"].includes(hostname);
    const proxyPort = process.env.DB_PROXY_PORT || "6543";
    const socketHost = databaseUrl.searchParams.get("host") || "";
    const safeDecode = (value: string) => {
      try {
        return decodeURIComponent(value);
      } catch {
        return value;
      }
    };
    const user = safeDecode(databaseUrl.username);
    const database = safeDecode(databaseUrl.pathname.replace(/^\//, ""));
    const looksLikeProduction =
      // written by `npm run db:env`, whatever port the proxy uses
      databaseUrl.searchParams.get("application_name") === "linkly-db-scripts" ||
      (loopback && databaseUrl.port === proxyPort) ||
      // production credentials through a tunnel on any local port
      (loopback && user === "linkly_app" && database === "linkly") ||
      hostname === "35.252.45.183" ||
      socketHost.includes("linkly-prod");
    if (looksLikeProduction) {
      throw new Error(
        "Refusing to start against the production database outside production. Use a local DATABASE_URL for development; production access is only for the npm run db:* commands (docs/database-access.md)."
      );
    }
  }
}

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"]
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
