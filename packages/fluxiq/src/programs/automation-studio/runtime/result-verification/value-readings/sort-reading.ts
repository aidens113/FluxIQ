// How Core read each key of a record set's sort, on the answer's own rows (t511).
//
// **Why.** Live run `run-mv6qr7fk-77f30b49` sorted its answer by `posted`,
// newest first, and Core read "Today", "Posted 3 days ago" ... as dates and
// stored the rows in that order. Both judges said, four times, that a sort on a
// posted string is not newest first, and the model added a column nobody asked
// for to satisfy them. The judges were shown the sort as written and the rows,
// never how Core read the values. So each key says what its column was read as
// (`automationStudioRecordAutoSortKind` decides `auto` exactly as the sort does),
// on how many rows, a few rows' readings, and, for the first key, whether the
// rows shown are in that order: a fact Core checks here, not the sort's promise.
//
// A key whose column some row holds withheld is not said: its count and order
// could not be told from what the judge is shown.

import {
  automationStudioRecordAutoSortKind,
  readAutomationStudioRecordSortValue,
  type AutomationStudioRecordSortKey,
  type AutomationStudioRecordSortReading
} from "@fluxiq/contracts/automation-studio";
import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioResultSortRead } from "../record-set-summary.ts";

/** The most rows whose reading is said per key. */
const READINGS_SHOWN = 4;
/** What a screened cell reads as in a summary row (`../result-summary.ts`). */
const WITHHELD_VALUE = "[withheld]";
const DAY_MS = 86_400_000;
const COLLATOR = new Intl.Collator(undefined, { sensitivity: "base", numeric: true });

const ORDER_WORDS: Record<AutomationStudioRecordSortReading, Record<AutomationStudioRecordSortKey["order"], string>> = {
  date: { desc: "newest first", asc: "oldest first" },
  number: { desc: "highest first", asc: "lowest first" },
  text: { desc: "Z to A", asc: "A to Z" }
};
const KIND_WORDS: Record<AutomationStudioRecordSortReading, string> = { date: "a date", number: "a number", text: "text" };

/** Each key Core can say on `rows`, in key order; `now` anchors relative dates, as the sort's did. */
export function automationStudioResultSortReadings(keys: readonly AutomationStudioRecordSortKey[], rows: readonly JsonObject[], now: number): AutomationStudioResultSortRead[] {
  const said: AutomationStudioResultSortRead[] = [];
  for (const [position, key] of keys.entries()) {
    const cells = rows.map((row) => (Object.hasOwn(row, key.field) ? row[key.field] : undefined));
    if (!cells.some((cell) => cell !== undefined && cell !== null) || cells.includes(WITHHELD_VALUE)) continue;
    const kind: AutomationStudioRecordSortReading = key.as === undefined || key.as === "auto" ? automationStudioRecordAutoSortKind(cells, now) : key.as;
    const values = cells.map((cell) => readAutomationStudioRecordSortValue(cell, kind, now));
    const read = values.filter((value) => value !== undefined).length;
    const first = position === 0;
    const inOrder = first ? ordered(values, key.order) : undefined;
    const lead = `${first ? "Core sorts this answer by" : "Then, among rows the keys before tie, by"} ${key.field}, ${ORDER_WORDS[kind][key.order]}, reading ${key.field} as ${KIND_WORDS[kind]}: ${read} of ${rows.length} rows state one`;
    const rest = read < rows.length ? `; the other ${rows.length - read} state none and come last` : "";
    const order = inOrder === undefined ? "" : inOrder ? " The rows above are in that order." : " The rows above are not in that order.";
    const readings = kind === "text" ? "" : ` Read: ${readingsOf(cells, values, kind)}.`;
    said.push({ field: key.field, ...(inOrder !== undefined ? { inOrder } : {}), said: `${lead}${rest}.${order}${readings}` });
  }
  return said;
}

/** Whether the values run in `order`, every unread value after every read one. */
function ordered(values: ReadonlyArray<number | string | undefined>, order: AutomationStudioRecordSortKey["order"]): boolean {
  for (let index = 1; index < values.length; index += 1) {
    const before = values[index - 1];
    const after = values[index];
    if (after === undefined) continue;
    if (before === undefined) return false;
    const compared = typeof before === "number" && typeof after === "number" ? before - after : COLLATOR.compare(String(before), String(after));
    if (order === "desc" ? compared < 0 : compared > 0) return false;
  }
  return true;
}

/** The first rows' readings: `"Posted 3 days ago" as 2026-10-10`, and how many more rows there are. */
function readingsOf(cells: readonly unknown[], values: ReadonlyArray<number | string | undefined>, kind: AutomationStudioRecordSortReading): string {
  const shownValues = values.slice(0, READINGS_SHOWN);
  const withTime = kind === "date" && sharesADay(shownValues);
  const shown = cells.slice(0, READINGS_SHOWN).map((cell, index) => {
    const value = shownValues[index];
    const text = typeof cell === "string" ? cell.replace(/\s+/gu, " ").trim() : JSON.stringify(cell ?? null);
    const as = value === undefined ? `no ${kind}` : kind === "date" && typeof value === "number" ? dateText(value, withTime) : String(value);
    return `${JSON.stringify(text)} as ${as}`;
  });
  const more = cells.length - shown.length;
  return `${shown.join("; ")}${more > 0 ? `; and ${more} more ${more === 1 ? "row" : "rows"}` : ""}`;
}

/** Whether two different instants among `values` fall on one day, so a date alone would not tell them apart. */
function sharesADay(values: ReadonlyArray<number | string | undefined>): boolean {
  const instants = values.filter((value): value is number => typeof value === "number");
  return instants.some((one, index) => instants.some((other, at) => at !== index && one !== other && Math.floor(one / DAY_MS) === Math.floor(other / DAY_MS)));
}

function dateText(instant: number, withTime: boolean): string {
  const date = new Date(instant);
  if (Number.isNaN(date.getTime())) return "no date";
  const iso = date.toISOString();
  return withTime ? `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC` : iso.slice(0, 10);
}
