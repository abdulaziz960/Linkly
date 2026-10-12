import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";
import { ENDPOINTS, buildOpenApi, curlFor } from "../lib/api-docs";

function routeFileFor(path: string) {
  const segments = path.replace(/^\//, "").split("/").map((segment) => (segment.startsWith("{") ? "[id]" : segment));
  return join(process.cwd(), "app", "api", "v1", ...segments, "route.ts");
}

describe("public API documentation", () => {
  it("documents only endpoints that exist, with the documented HTTP method exported", () => {
    for (const endpoint of ENDPOINTS) {
      const file = routeFileFor(endpoint.path);
      expect(existsSync(file), `${endpoint.method} ${endpoint.path} -> ${file}`).toBe(true);
      expect(readFileSync(file, "utf8")).toMatch(new RegExp(`export async function ${endpoint.method}\\(`));
    }
  });

  it("has unique endpoint ids and a cURL sample for each", () => {
    const ids = ENDPOINTS.map((endpoint) => endpoint.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const endpoint of ENDPOINTS) expect(curlFor(endpoint)).toContain("Authorization: Bearer");
  });

  it("generates an OpenAPI 3.1 document covering every endpoint", () => {
    const spec = buildOpenApi() as { openapi: string; paths: Record<string, Record<string, unknown>> };
    expect(spec.openapi).toBe("3.1.0");
    for (const endpoint of ENDPOINTS) expect(spec.paths[endpoint.path]?.[endpoint.method.toLowerCase()]).toBeTruthy();
  });
});
