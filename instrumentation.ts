import type { Instrumentation } from "next";

export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  const value = error instanceof Error ? error : new Error(String(error));
  console.error(JSON.stringify({
    event: "request_error",
    at: new Date().toISOString(),
    method: request.method,
    path: request.path,
    routerKind: context.routerKind,
    routePath: context.routePath,
    routeType: context.routeType,
    message: value.message,
    digest: "digest" in value ? String(value.digest) : undefined
  }));
};
