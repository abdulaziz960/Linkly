import { buildOpenApi } from "../../lib/api-docs";

export const dynamic = "force-static";

/** Machine-readable API description (OpenAPI 3.1), generated from lib/api-docs.ts. */
export function GET() {
  return Response.json(buildOpenApi(), {
    headers: { "Access-Control-Allow-Origin": "*", "Cache-Control": "public, max-age=3600" }
  });
}
