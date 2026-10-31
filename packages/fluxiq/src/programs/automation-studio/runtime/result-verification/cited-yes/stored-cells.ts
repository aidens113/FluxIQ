import type { JsonValue } from "../../../../../core/index.ts";
import type { AutomationStudioRunResultSummary } from "../contracts/index.ts";
import { automationStudioResultReadWorkingSets } from "../read-account/index.ts";

/**
 * The result's stored rows as a citation is held to them (`./index.ts`, t810):
 * each answer row (never a working set's, `../read-account/working-sets.ts`)
 * by its label, the first of the set's columns it holds text in, with every
 * cell it holds said as text. `complete` is false where Core holds only some
 * of the answer's rows (a sample, a truncated or cut set) or holds no cell of
 * them, so a row it does not find may still be there.
 */
export function automationStudioResultCitedStoredCells(summary: Pick<AutomationStudioRunResultSummary, "reads" | "recordSets">): {
  rows: Array<{ label: string; cells: Record<string, string> }>;
  complete: boolean;
} {
  const working = automationStudioResultReadWorkingSets(summary);
  const answer = summary.recordSets.filter((set) => !working.has(set.datasetId));
  const rows = answer.flatMap((set) => (set.sampleRows ?? []).flatMap((row) => {
    const cells: Record<string, string> = {};
    for (const [column, value] of Object.entries(row)) {
      const said = cellText(value);
      if (said) cells[column] = said;
    }
    const column = set.columns.find((id) => cells[id] !== undefined) ?? Object.keys(cells)[0];
    return column === undefined ? [] : [{ label: cells[column]!, cells }];
  }));
  const complete = answer.length > 0 && answer.every((set) => !set.truncated && (set.sampleRows?.length ?? 0) >= set.recordCount);
  return { rows, complete };
}

/** A cell as text: a string as it is, a number or flag as written; nothing for the rest. */
function cellText(value: JsonValue | undefined): string {
  if (typeof value === "string") return value.trim();
  return typeof value === "number" || typeof value === "boolean" ? String(value) : "";
}
