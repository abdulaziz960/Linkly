import { PrismaClient } from "@prisma/client";

const isProduction = process.env.NODE_ENV === "production";

if (!process.env.DATABASE_URL) {
  if (isProduction) {
    throw new Error("DATABASE_URL is required in production. Configure a persistent database for AudienceW before deploying.");
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
