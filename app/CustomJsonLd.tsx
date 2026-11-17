import { headers } from "next/headers";
import { getPageJsonLd } from "../lib/page-seo";
import JsonLd from "./JsonLd";

/** The structured data an admin added for the page being shown (from the page-SEO screen); nothing on the signed-in or private pages. */
export default async function CustomJsonLd() {
  const path = (await headers()).get("x-linkly-path") ?? "";
  if (!path || /^\/(dashboard|linkly-admin007|billing|checkout|api)(\/|$)/.test(path)) return null;
  const data = await getPageJsonLd(path.length > 1 ? path.replace(/\/+$/, "") : path);
  return data ? <JsonLd data={data} /> : null;
}
