// A stored row as a citation and the judge's copy both read it (`../../cited-yes/stored-cells.ts`,
// `../summary/with/row-handles.ts`): one rule, so the rank a row's handle carries is the rank the citation is held to.

import type { JsonValue } from "../../../../core/index.ts";

/** A stored row: its label, the first of the set's columns it holds text in (else its first cell), and every cell it holds said as text. */
export type AutomationStudioRequestStoredRow = { label: string; cells: Record<string, string> };

/** `row` as a stored row of a set with these `columns`, or nothing where it holds no cell text. */
export function automationStudioRequestStoredRow(columns: readonly string[], row: Readonly<Record<string, JsonValue | undefined>>): AutomationStudioRequestStoredRow | undefined {
  const cells: Record<string, string> = {};
  for (const [column, value] of Object.entries(row)) {
    const said = cellText(value);
    if (said) cells[column] = said;
  }
  const column = columns.find((id) => cells[id] !== undefined) ?? Object.keys(cells)[0];
  return column === undefined ? undefined : { label: cells[column]!, cells };
}

/** A cell as text: a string as it is, a number or flag as written; nothing for the rest. */
function cellText(value: JsonValue | undefined): string {
  if (typeof value === "string") return value.trim();
  return typeof value === "number" || typeof value === "boolean" ? String(value) : "";
}
