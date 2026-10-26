import { headers } from "next/headers";
import { safeJsonLd } from "../lib/json-ld";

export default async function JsonLd({ data }: { data: unknown }) {
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return <script nonce={nonce} type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(data) }} />;
}
