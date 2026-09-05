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
  const source = context.routePath || request.path || "server";
  try {
    const { prisma } = await import("./lib/prisma");
    await prisma.adminLog.create({
      data: {
        id: `log-err-${randomUUID()}`,
        at: new Date().toISOString(),
        clientId: "system",
        clientName: "النظام",
        source,
        level: "خطأ",
        message: `${request.method} ${request.path} فشل: ${value.message}${digest ? ` (digest: ${digest})` : ""}`
      }
    });

    // A single failure just needs a log line to review later, but the same
    // route failing the same way repeatedly means something is systemically
    // broken (a bad deploy, an expired credential, a misconfigured secret)
    // and deserves surfacing above the noise rather than staying buried
    // among ordinary error entries - so escalate once into the "تنبيه"
    // bucket the moment a failure signature recurs 3+ times, and never
    // again for that same signature (the marker below is the dedup key).
    const repeatCount = await prisma.adminLog.count({
      where: { level: "خطأ", source, message: { contains: value.message } }
    });
    if (repeatCount >= 3) {
      const alertMarker = `[repeat-failure:${source}]`;
      const alreadyAlerted = await prisma.adminLog.findFirst({
        where: { level: "تنبيه", message: { contains: `${alertMarker} ${value.message}` } }
      });
      if (!alreadyAlerted) {
        await prisma.adminLog.create({
          data: {
            id: `log-alert-${randomUUID()}`,
            at: new Date().toISOString(),
            clientId: "system",
            clientName: "النظام",
            source,
            level: "تنبيه",
            message: `${alertMarker} ${value.message} تكرر ${repeatCount} مرات على نفس المسار — راجع السجلات وتأكد من استقرار هذا الجزء من النظام.`
          }
        });
      }
    }
  } catch (loggingError) {
    console.error("Failed to write request error into admin_logs", loggingError);
  }
};
