import type { FlowOutline, OutlineStep } from "../wire";
import { lastingBadges } from "./lasting-badges";

/** A badge's word as the verb after "May". */
const VERBS: Record<string, string> = { sends: "send", deletes: "delete", pays: "pay", changes: "change", creates: "create" };

/**
 * The interface card's "May" line: the lasting acts the Flow's steps declare, and the sites a
 * run may act on when the Flow names them ("May send and delete · on market.example").
 */
export function mayWords(outline: FlowOutline, sites: readonly string[]): string {
  const lasting = new Set<string>();
  const collect = (steps: readonly OutlineStep[]) => {
    for (const step of steps) {
      for (const kind of step.lasting) lasting.add(kind);
      collect(step.children);
      for (const arm of step.arms) collect(arm.steps);
    }
  };
  collect(outline.steps);
  const badges = lastingBadges([...lasting]);
  const acts = badges.length ? `May ${listWords(badges.map((badge) => VERBS[badge] ?? badge))}` : "Only reads and looks; changes nothing that lasts";
  return sites.length ? `${acts} · on ${listWords(sites)}` : acts;
}

function listWords(items: readonly string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}
