// How a sort key reads a stored cell (P7): as a number, a date, or text, and,
// for `auto`, which of those a column is. The rules are the downstream web
// domain's (its page-side `order-rows`), held equal by the parity table.

import { cellText, collapsedText } from "./cell-text.ts";
import { readAutomationStudioRecordDate } from "./read-date.ts";
import { readAutomationStudioRecordNumber } from "./read-number.ts";
import type { AutomationStudioRecordSortType } from "./types.ts";

/** The kinds a sort key reads a value as, once `auto` is decided. */
export type AutomationStudioRecordSortReading = Exclude<AutomationStudioRecordSortType, "auto">;

/**
 * The cell read as `kind`, or `undefined` for a cell that holds no value or does
 * not state one of that kind. A stored number reads as itself; any other cell
 * reads through its text. Text is the cell's text with its layout removed.
 */
export function readAutomationStudioRecordSortValue(cell: unknown, kind: AutomationStudioRecordSortReading, now: number): number | string | undefined {
  if (kind === "number" && typeof cell === "number") return Number.isFinite(cell) ? cell : undefined;
  const text = cellText(cell);
  if (text === undefined) return undefined;
  if (kind === "number") return readAutomationStudioRecordNumber(text);
  if (kind === "date") return readAutomationStudioRecordDate(text, now);
  return collapsedText(text);
}

/**
 * What an `auto` key reads a column as: dates when more than half of its
 * present values state one, else numbers when more than half state one, else
 * text. Decided once over the rows being sorted.
 */
export function automationStudioRecordAutoSortKind(cells: readonly unknown[], now: number): AutomationStudioRecordSortReading {
  const present = cells.filter((cell) => cellText(cell) !== undefined);
  if (present.length === 0) return "text";
  const most = (kind: AutomationStudioRecordSortReading): boolean =>
    present.filter((cell) => readAutomationStudioRecordSortValue(cell, kind, now) !== undefined).length * 2 > present.length;
  if (most("date")) return "date";
  if (most("number")) return "number";
  return "text";
}
