// Which collected rows are the same row (P4). Identity is computed, never
// stored: a string compares with its layout and case ignored, any other value
// by its JSON, and a missing, `null` or blank value as empty.

import { cellOf, foldedText } from "./cell-text.ts";

/**
 * The row's identity under the fields `by`, or `undefined` when every one of
 * them is empty: a row that cannot be identified is never a duplicate, since
 * folding every such row into one would drop rows that differ elsewhere.
 */
export function automationStudioRecordRowIdentity(values: Readonly<Record<string, unknown>>, by: readonly string[]): string | undefined {
  const compared = by.map((field) => {
    const cell = cellOf(values, field);
    if (cell === undefined || cell === null) return "";
    return typeof cell === "string" ? foldedText(cell) : JSON.stringify(cell);
  });
  return compared.every((value) => value === "") ? undefined : JSON.stringify(compared);
}
