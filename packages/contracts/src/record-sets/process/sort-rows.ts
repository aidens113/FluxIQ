// A stable sort of rows by up to four keys. Each key reads its column as its
// declared kind, or as the kind `auto` decides over these rows. A value that
// cannot be read goes after every value that can, whichever the direction;
// ties fall to the next key and then to the rows' incoming order.

import { cellOf } from "./cell-text.ts";
import { automationStudioRecordAutoSortKind, readAutomationStudioRecordSortValue, type AutomationStudioRecordSortReading } from "./sort-value.ts";
import type { AutomationStudioRecordSortKey } from "./types.ts";

type Comparable = number | string;

const COLLATOR = new Intl.Collator(undefined, { sensitivity: "base", numeric: true });

/** The rows in key order, a new array; the rows themselves are not copied. `now` anchors relative dates. */
export function sortAutomationStudioRecordRows<T extends { readonly values: Readonly<Record<string, unknown>> }>(
  rows: readonly T[],
  keys: readonly AutomationStudioRecordSortKey[],
  now: number
): T[] {
  if (keys.length === 0) return [...rows];
  const kinds: AutomationStudioRecordSortReading[] = keys.map((key) =>
    key.as === undefined || key.as === "auto" ? automationStudioRecordAutoSortKind(rows.map((row) => cellOf(row.values, key.field)), now) : key.as
  );
  const decorated = rows.map((row, index) => ({
    row,
    index,
    values: keys.map((key, position) => readAutomationStudioRecordSortValue(cellOf(row.values, key.field), kinds[position]!, now))
  }));
  decorated.sort((a, b) => {
    for (const [position, key] of keys.entries()) {
      const left = a.values[position];
      const right = b.values[position];
      if (left === undefined || right === undefined) {
        if (left === right) continue;
        return left === undefined ? 1 : -1;
      }
      const compared = compare(left, right);
      if (compared !== 0) return key.order === "desc" ? -compared : compared;
    }
    return a.index - b.index;
  });
  return decorated.map((entry) => entry.row);
}

function compare(left: Comparable, right: Comparable): number {
  if (typeof left === "number" && typeof right === "number") return left - right;
  return COLLATOR.compare(String(left), String(right));
}
