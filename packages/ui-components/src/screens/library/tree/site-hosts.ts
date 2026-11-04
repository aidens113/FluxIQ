import { siteHost } from "../words/index.ts";
import type { SubflowCard } from "../types.ts";

/** The label a subflow with no site is grouped under. */
export const NO_SITE = "No site";

/** The hosts a subflow works on, each once, in the order it lists them. */
export function siteHosts(card: SubflowCard): string[] {
  const hosts = [...new Set(card.sites.map(siteHost))];
  return hosts.length > 0 ? hosts : [NO_SITE];
}
