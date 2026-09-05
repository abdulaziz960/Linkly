export const publicCorsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Max-Age": "86400"
};

export function withCors(response: Response) {
  for (const [key, value] of Object.entries(publicCorsHeaders)) {
    response.headers.set(key, value);
  }
  return response;
}
