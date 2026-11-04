import type { SubflowCard } from "../types.ts";
import { siteHosts } from "./site-hosts.ts";

/** Everything a person might search a subflow by, in one lower-case line: its words, what it takes and gives, its sites and fixed values. */
function searchable(card: SubflowCard): string {
  return [card.name, card.purpose, ...card.inputs.map((item) => item.name), ...card.outputs.map((item) => item.name), ...siteHosts(card), ...card.fixedValues].join(" ").toLowerCase();
}

/** Whether every word the person typed is somewhere on the card. */
export function cardMatches(card: SubflowCard, text: string): boolean {
  const words = text.toLowerCase().split(/\s+/u).filter((word) => word !== "");
  if (words.length === 0) return true;
  const line = searchable(card);
  return words.every((word) => line.includes(word));
}
