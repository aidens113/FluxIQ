// Which row of a list a row read again is, in the same list and the same columns.
//
// A row repeated whole is that row. A row an act or the site changed reads otherwise, so the row is
// also told by the column that tells this list's rows apart: one whose values are all different
// within each read, where each value could name a thing (a bare number or a date ties nothing, as
// different rows share those all the time; `runtime/answer-first/act-record/same-row.ts`, rule 2), and
// which the two reads agree on most. The site's words and the columns' names play no part.
//
// That rule leans the other way from this one. A row wrongly held done costs a row a judge's no
// brings back, so it ties on a share of a field's words. A row wrongly tied here is overwritten and
// lost, so this ties on a whole value. On a read of a few rows, where a word like a state can be
// on one row of each by chance, a value ties only when no fuller value that could also tell them
// apart differs between the two rows, or it is an address. On a longer read a column the reads
// share on many rows is enough, since by chance they would not.

import type { JsonObject, JsonValue } from "../../../../../core/index.ts";
import { stableJson } from "../../stable-json.ts";

/** Reads this short say too little for a column's agreement alone to tie their rows. */
const SHORT_READ = 3;

/** For each row of `read`, the index in `held` of the row it is, or `undefined`. No two rows of `read` are one row of `held`. */
export function automationStudioAnswerFirstRowTies(held: readonly JsonObject[], read: readonly JsonObject[], columns: readonly string[]): (number | undefined)[] {
  const taken = new Set<number>();
  const whole = new Map<string, number>();
  held.forEach((row, at) => {
    const key = stableJson(row);
    if (!whole.has(key)) whole.set(key, at);
  });
  const ties = read.map((row) => {
    const at = whole.get(stableJson(row));
    if (at === undefined || taken.has(at)) return undefined;
    taken.add(at);
    return at;
  });
  const telling = columns.filter((column) => tells(held, column) && tells(read, column));
  const shares = telling.map((column) => {
    const values = new Set(held.map((row) => cell(row[column])));
    return read.filter((row) => cell(row[column]) !== "" && values.has(cell(row[column]))).length;
  });
  const most = Math.max(0, ...shares);
  const by = most === 0 ? undefined : telling[shares.indexOf(most)];
  if (by === undefined) return ties;
  const smaller = Math.min(held.length, read.length);
  const wide = smaller >= SHORT_READ && most * 2 >= smaller;
  const at = new Map(held.map((row, index) => [cell(row[by]), index]));
  read.forEach((row, index) => {
    const value = cell(row[by]);
    const found = value === "" ? undefined : at.get(value);
    if (ties[index] !== undefined || found === undefined || taken.has(found)) return;
    const other = held[found]!;
    if (!wide && !isAddress(value) && telling.some((column) => cell(other[column]) !== cell(row[column]) && Math.max(cell(other[column]).length, cell(row[column]).length) > value.length)) return;
    ties[index] = found;
    taken.add(found);
  });
  return ties;
}

/** Whether a column can tell these rows apart: each value present is different, and could name a thing. */
function tells(rows: readonly JsonObject[], column: string): boolean {
  const values = rows.map((row) => row[column]).filter((value) => cell(value) !== "");
  return values.length > 0 && new Set(values.map(cell)).size === values.length && values.every((value) => (typeof value === "string" || typeof value === "number") && naming(String(value)));
}

function naming(words: string): boolean {
  return /\p{L}/u.test(words) || /^\d{6,}$/u.test(words.trim());
}

function isAddress(value: string): boolean {
  return /^[a-z][a-z\d+.-]*:\/\/|^\//iu.test(value);
}

function cell(value: JsonValue | undefined): string {
  if (value === undefined || value === null) return "";
  return typeof value === "object" ? stableJson(value) : String(value).trim();
}
