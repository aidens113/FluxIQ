import type { AutomationStudioResultLeftOutNamingTheItem } from "../contracts/index.ts";

/** Core's line for one condition's flagged rows a yes did not name, as `repair.checked` carries it to a build's repair. */
export function unaccountedLine(entry: AutomationStudioResultLeftOutNamingTheItem): string {
  const where = entry.step !== undefined ? `Step ${entry.step}` : `Read ${entry.nodeId ?? "(unnamed)"}`;
  return `The check answered yes without accounting for ${entry.rows.length === 1 ? "this row" : "these rows"} the ${entry.condition} (${where}) alone left out, which name "${entry.item}" first and ${entry.also.map((phrase) => `"${phrase}"`).join(", ")} only after it: ${entry.rows.join("; ")}.`;
}
