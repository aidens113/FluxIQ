import type { AutomationStudioRequestRowsKeptNumberLeftOut } from "../request-rows/index.ts";

/** Core's line for one text condition's left-out rows stating a number it kept, as `repair.checked` carries it to a build's repair. */
export function keptNumberLine(entry: AutomationStudioRequestRowsKeptNumberLeftOut): string {
  const range = entry.low === entry.high ? String(entry.low) : `${entry.low} to ${entry.high}`;
  const rows = entry.rows.map((row, index) => `${row} (states ${entry.numbers[index]})`).join("; ");
  return `The check answered yes though the ${entry.condition} (Read ${entry.nodeId}) kept rows stating ${range} and alone left out ${entry.rows.length === 1 ? "this row, which states" : "these rows, which state"} a number in that range: ${rows}.`;
}
