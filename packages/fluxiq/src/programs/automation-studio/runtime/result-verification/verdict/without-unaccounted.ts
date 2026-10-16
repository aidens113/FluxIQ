import type { AutomationStudioResultLeftOutNamingTheItem } from "../contracts/index.ts";
import type { AutomationStudioRequestRowsUnquoted } from "../request-rows/index.ts";

/** The unquoted rows less those the named-rows check already reported for the same condition: one line per row is enough. */
export function withoutUnaccounted(unquoted: AutomationStudioRequestRowsUnquoted[], unaccounted: readonly AutomationStudioResultLeftOutNamingTheItem[]): AutomationStudioRequestRowsUnquoted[] {
  return unquoted.flatMap((entry) => {
    if (entry.bound) return [entry];
    const said = new Set(unaccounted.filter((other) => other.step === entry.step && other.nodeId === entry.nodeId && other.condition === entry.condition).flatMap((other) => other.rows));
    const rows = entry.rows.filter((row) => !said.has(row));
    return rows.length ? [{ ...entry, rows }] : [];
  });
}
