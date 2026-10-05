import { getLandingText, slotId, type Lang } from "../lib/landing-content";

/** A piece of home-page text that an admin can replace from the panel; `children` is the built-in default. */
export default async function T({ l, children }: { l: Lang; children: string }) {
  return (await getLandingText()).get(slotId(l, children)) ?? children;
}

/** Same lookup for plain strings (used by the section intros). */
export async function landingText(l: Lang, text: string): Promise<string>;
export async function landingText(l: Lang, text: undefined): Promise<undefined>;
export async function landingText(l: Lang, text: string | undefined): Promise<string | undefined> {
  if (text === undefined) return undefined;
  return (await getLandingText()).get(slotId(l, text)) ?? text;
}
