import type { Instrumentation } from "next";
import { randomUUID } from "crypto";

export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  const value = error instanceof Error ? error : new Error(String(error));
  const digest = "digest" in value ? String(value.digest) : undefined;
  console.error(JSON.stringify({
    event: "request_error",
    at: new Date().toISOString(),
    method: request.method,
    path: request.path,
    routerKind: context.routerKind,
    routePath: context.routePath,
    routeType: context.routeType,
    message: value.message,
    digest
  }));

  // Cloud Logging captures the console.error above, but the admin panel's
  // own "السجلات" page reads from the admin_logs table, not Cloud Logging -
  // without this, every uncaught server error (including every 5xx) was
  // invisible there no matter how many actually happened. This is a
  // best-effort side write: never let a logging failure turn into a second
  // error on top of the one already being reported.
  try {
    const { prisma } = await import("./lib/prisma");
    await prisma.adminLog.create({
      data: {
        id: `log-err-${randomUUID()}`,
        at: new Date().toISOString(),
        clientId: "system",
        clientName: "النظام",
        source: context.routePath || request.path || "server",
        level: "خطأ",
        message: `${request.method} ${request.path} فشل: ${value.message}${digest ? ` (digest: ${digest})` : ""}`
      }
    });
  } catch (loggingError) {
    console.error("Failed to write request error into admin_logs", loggingError);
  }
};
