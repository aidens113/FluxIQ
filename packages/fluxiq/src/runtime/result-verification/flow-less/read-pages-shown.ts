// The pages a result's rows were read from, as the judge is shown them (`./types.ts`, `readPages`).
//
// A result made of a run's rows can come from several pages while the end view is the one page the run
// left, so a judge shown only that page said "unknown" of rows it could not place (run-mwa19obz-abd5d558,
// judge 0032: "the only page shown is page 3 ... pages 1 and 2 are not shown", the rows having been read
// from them). Core already holds where each read read and how many rows it kept (the row sink's pages);
// this says them, one entry each, bounded, with no page text. An address that a screen drops is withheld
// here, and the summary is then marked withheld, as a screened `looked` line is.
//
// **Which rows each read kept, and what it left out (run-mwaknxf9-7549d126).** A site that lists one product
// twice, once as an ad and once not, shows the judge two cards of one name; with the rows by name and the
// pages by count alone, judges 0043 and 0060 took a kept non-ad row for its ad card, and judge 0114 took the
// non-ad card a name condition dropped for the ad correctly left out (`./read-left-out.ts`). So each entry
// also says the rows that read kept, by label (`keptRows`), and the rows its own conditions left out
// (`leftOut`), each set under the conditions that left it out, named as every other line names a condition
// (`../read-account/condition-name.ts`), worded as the read's call wrote it (`../read-account/condition.ts`)
// and with what the condition read on the items it left out, where the read said. Labels are screened as a
// run's left-out rows are (`../read-account/alone-rows.ts`). Every row is said: nothing is cut.
//
// **A label both kept and left out is two items (run-mwaudvnh-c208d32c).** On that site a product's non-ad card was
// kept on page 1 and its ad card, with the same name, left out on page 2. With both shown, judges 0241 and 0260 still
// read the one label as one item both kept and dropped, and refused or doubted a right list. A read keeps an item only
// when it met every one of that read's conditions, so a left-out row whose label is a row some read kept is another
// item shown under the same label: the kept one passed, this one was turned down. Each set says those rows by label in
// `sameLabelKept`, and the question says what that means (`./question.ts`). The flow-less twin of the run judge's
// `leftOutAlsoInResult` (`../request-rows/summary/with/also-in-result.ts`). A withheld label is no row's own, so it is
// never marked.

import type { JsonObject, JsonValue } from "../../../core/index.ts";
import { automationStudioResultConditionName, automationStudioResultReadAloneRows, automationStudioResultReadConditionText } from "../read-account/index.ts";
import type { AutomationStudioFlowLessReadLeftOut } from "./read-left-out.ts";
import type { AutomationStudioFlowLessSummary } from "./types.ts";

/** The latest reads shown, and how much of an address, a place and a value a condition read. */
const READS_SHOWN = 40;
const WHERE_CHARS = 300;
const PLACE_CHARS = 80;
const FOUND_CHARS = 200;

type ShownLeftOut = { by: string; rows: string[]; sameLabelKept?: string[] };
type ShownPage = { where?: string; place?: string; kept: number; keptRows?: string[]; leftOut?: ShownLeftOut[] };

export type AutomationStudioFlowLessReadPagesShown = { pages: ShownPage[]; notShown?: number; withheld: boolean };

/** The reads of a result made of rows, each as one entry; none for a result with no rows or no read that said where. */
export function automationStudioFlowLessReadPagesShown(
  summary: Pick<AutomationStudioFlowLessSummary, "rows" | "readPages">,
  screen: (text: string) => { text: string; withheld: boolean },
  deniedKeys: readonly string[]
): AutomationStudioFlowLessReadPagesShown {
  const reads = summary.rows ? summary.readPages ?? [] : [];
  let withheld = false;
  const line = (text: string, most: number): string => {
    const screened = screen(cut(text, most));
    if (screened.withheld) withheld = true;
    return screened.text;
  };
  const onWithheld = (): void => {
    withheld = true;
  };
  const labelColumn = summary.rows?.columns[0]?.id;
  const keptByLabel = keptLabelTest(reads.flatMap((read) => read.rows ?? []), labelColumn);
  const shown = reads.slice(-READS_SHOWN).map((read): ShownPage => {
    const keptRows = read.rows && labelColumn !== undefined ? labels(read.rows, labelColumn, deniedKeys, onWithheld) : undefined;
    const leftOut = read.leftOut ? leftOutShown(read.leftOut, deniedKeys, (text) => line(text, FOUND_CHARS), onWithheld, keptByLabel) : undefined;
    return {
      ...(read.where ? { where: line(read.where, WHERE_CHARS) } : {}),
      ...(read.place ? { place: line(read.place, PLACE_CHARS) } : {}),
      kept: Number.isSafeInteger(read.kept) && read.kept >= 0 ? read.kept : 0,
      ...(keptRows?.length ? { keptRows } : {}),
      ...(leftOut?.length ? { leftOut } : {})
    };
  });
  return { pages: shown, ...(reads.length > shown.length ? { notShown: reads.length - shown.length } : {}), withheld };
}

/** Each kept row by its label, its value in the result's first column, screened as a left-out row's label is. */
function labels(rows: readonly JsonObject[], column: string, deniedKeys: readonly string[], onWithheld: () => void): string[] | undefined {
  const cells = rows.flatMap((row): JsonObject[] => {
    const value = row[column];
    return typeof value === "string" || typeof value === "number" ? [{ [column]: String(value) }] : [];
  });
  return automationStudioResultReadAloneRows(cells, deniedKeys, onWithheld);
}

/** Each set of rows the read's conditions left out, under the conditions that left it out (header). */
function leftOutShown(leftOut: AutomationStudioFlowLessReadLeftOut, deniedKeys: readonly string[], foundLine: (text: string) => string, onWithheld: () => void, keptByLabel: (row: JsonObject) => boolean): ShownLeftOut[] {
  const named = (index: number): string => {
    const wording = conditionWording(leftOut.where?.[index], leftOut.columns, deniedKeys);
    const found = [...new Set((leftOut.found?.[index] ?? []).map(foundLine).filter((value) => value.trim()))];
    const read = found.length ? `it read ${found.map((value) => JSON.stringify(value)).join(", ")} on the items it left out` : undefined;
    return automationStudioResultConditionName(index + 1, read ? `${wording ?? "wording withheld"}; ${read}` : wording);
  };
  return leftOut.sets.flatMap((set) => {
    const rows = automationStudioResultReadAloneRows([...set.rows], deniedKeys, onWithheld);
    if (!rows?.length || set.conditions.length === 0) return [];
    const names = set.conditions.map(named);
    const by = set.kind === "alone" ? `${names[0]} by itself, every other condition keeping these rows`
      : set.kind === "unsplit" ? `${names[0]}, by itself or with another condition`
        : names.length === 1 ? `${names[0]} and another condition, each of which left these rows out` : `${names.join(" and ")} together, each of which left these rows out`;
    const sameLabelKept = set.rows.filter(keptByLabel).flatMap((row) => ownLabel(row, deniedKeys));
    return [{ by, rows, ...(sameLabelKept.length ? { sameLabelKept } : {}) }];
  });
}

/**
 * Whether a left-out row's label is the label of a row some read kept (header): its first cell's value, trimmed, equal to a
 * kept row's value in that same column, or in the result's label column where the kept rows have no such column.
 */
function keptLabelTest(kept: readonly JsonObject[], labelColumn: string | undefined): (row: JsonObject) => boolean {
  return (row) => {
    const [cell] = Object.entries(row);
    const label = cell && typeof cell[1] === "string" ? cell[1].trim() : "";
    if (!cell || !label) return false;
    return kept.some((held) => {
      const value = Object.hasOwn(held, cell[0]) ? held[cell[0]] : labelColumn === undefined ? undefined : held[labelColumn];
      return (typeof value === "string" || typeof value === "number") && String(value).trim() === label;
    });
  };
}

/** A row's label alone, screened as every label here is; none where it may not be said (header). */
function ownLabel(row: JsonObject, deniedKeys: readonly string[]): string[] {
  const [cell] = Object.entries(row);
  if (!cell) return [];
  let withheld = false;
  const said = automationStudioResultReadAloneRows([{ [cell[0]]: cell[1] ?? null }], deniedKeys, () => {
    withheld = true;
  });
  return withheld || !said ? [] : said;
}

/**
 * A condition in the words its call wrote it, with the field it tests said as the column whose read it is, where one
 * is (a read's columns name the field each reads); `undefined` where nothing of it may be said.
 */
function conditionWording(condition: JsonValue | undefined, columns: JsonObject | undefined, deniedKeys: readonly string[]): string | undefined {
  if (!isRecord(condition)) return undefined;
  const field = condition.field;
  const column = typeof field === "string" && columns ? Object.entries(columns).find(([key, read]) => key === field || read === field)?.[0] : undefined;
  return automationStudioResultReadConditionText(column === undefined ? condition : { ...condition, field: column }, columns, deniedKeys);
}

/** At most `most` characters, by code point, with `…` where it was cut. */
function cut(text: string, most: number): string {
  const characters = [...text];
  return characters.length <= most ? text : `${characters.slice(0, most - 1).join("")}…`;
}

function isRecord(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
