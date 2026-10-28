import type { AutomationStudioLlmVerificationDefect } from "../../llm/index.ts";
import type { AutomationStudioResultReadAccount, AutomationStudioRunResultSummary } from "../contracts/index.ts";
import { automationStudioResultReadListContinues, automationStudioResultReadStop, automationStudioResultReadWorkingSets } from "../read-account/index.ts";
import {
  automationStudioResultLeftOutFinding,
  type AutomationStudioResultNoLeftOutRow,
  type AutomationStudioResultNoRecord,
  type AutomationStudioResultNoStoredRow
} from "../refuted-no/index.ts";
import { AutomationStudioRequestRowId } from "../request-rows/index.ts";
import { automationStudioResultActDefectNotFound } from "./act-located.ts";
import { automationStudioResultActSteps, type AutomationStudioResultActStep } from "./act-steps.ts";
import { automationStudioResultLeftOutLabelKey, automationStudioResultLeftOutRowCells } from "./row-cells.ts";

type Defect = AutomationStudioLlmVerificationDefect;
type Context = { record: AutomationStudioResultNoRecord; summary: Pick<AutomationStudioRunResultSummary, "reads" | "recordSets" | "flowShape" | "buildTest"> };

/**
 * Which of a no's defects Core finds in its own record of the result (header,
 * `./index.ts`), and Core's words for each it does not: `located` in the order
 * listed, `findings` one sentence per defect not found.
 */
export function automationStudioResultDefectsLocated(
  defects: readonly Defect[],
  context: Context
): { located: Defect[]; findings: string[] } {
  const located: Defect[] = [];
  const findings: string[] = [];
  // Core's record of the steps the run took, read once and only for an act defect (`./act-steps.ts`, t766).
  let steps: AutomationStudioResultActStep[] | undefined;
  const actSteps = (): AutomationStudioResultActStep[] => (steps ??= automationStudioResultActSteps(context.summary));
  // Each left-out row's own cells, read once and only for a row a defect names (`./row-cells.ts`, t771).
  let cells: Map<string, Array<Record<string, string>>> | undefined;
  const leftOutCells = (): Map<string, Array<Record<string, string>>> => (cells ??= automationStudioResultLeftOutRowCells(context.summary, context.record));
  for (const defect of defects) {
    const missing = notFound(defect, context, actSteps, leftOutCells);
    if (missing === undefined) located.push(defect);
    else findings.push(missing);
  }
  return { located, findings };
}

/** Why Core does not find one defect in its record, or nothing where it does. */
function notFound(defect: Defect, context: Context, actSteps: () => AutomationStudioResultActStep[], leftOutCells: () => Map<string, Array<Record<string, string>>>): string | undefined {
  const { record, summary } = context;
  // Core cannot locate non-row requirements by row membership. Keep the uncertainty explicit; never infer correctness from this boundary.
  if (defect.kind === "other") return "This requirement is not measurable by Core\'s row-membership checks; it remains unconfirmed against the original request.";
  const unsaid = requestWordsUnsaid(defect.requestWords, record.says);
  if (unsaid) return unsaid;
  // An act the request asks for, looked for in Core's record of the steps the run took (`./act-located.ts`, t766).
  if (defect.kind === "act_missing" || defect.kind === "act_wrong") return automationStudioResultActDefectNotFound(defect, actSteps());
  const quoted = `"${defect.row}"`;
  const rows = rowsNamed(defect.row, record, leftOutCells());
  if (defect.kind !== "asked_missing") {
    if (!rows.stored.length) return `${quoted} is no row the result holds${rows.leftOut.length || rows.seen ? ": a read saw it, and it was left out" : ""}.`;
    const column = storedColumn(defect.column ?? "", rows.stored, summary);
    if ((defect.kind === "wrong_value" || defect.value !== undefined) && !column) return `The result stores no column "${defect.column ?? ""}" that can be resolved unambiguously for ${quoted}.`;
    if (defect.value !== undefined && defect.column) {
      const values = rows.stored.flatMap((row) => Object.entries(row.cells).filter(([key]) => bare(key) === column).map(([, value]) => value));
      if (!values.length) return `Core holds no measured stored cell for column "${defect.column}" of ${quoted}, so its claimed value remains unconfirmed.`;
      if (values.every((value) => fold(value) !== fold(defect.value!))) return `Core's stored cell contradicts the value the judge claims for column "${defect.column}" of ${quoted}.`;
    }
    return undefined;
  }
  if (rows.stored.length) return `${quoted} is a row the result holds.`;
  // A left-out row Core accounts for by the request's own words is no row the request asks for (`../../refuted-no/record.ts`, t629).
  if (rows.leftOut.length && rows.leftOut.every((row) => row.quotesRequest)) return [...new Set(rows.leftOut.map(automationStudioResultLeftOutFinding))].join(" ");
  // A row a read saw and left out is one the request asks for only by its own cells (header, t771).
  if (rows.leftOut.length || rows.seen) return askedCellNotFound(defect, quoted, rows.cells, rows.label);
  // Rows not read, or a row Core holds no record of: only a read whose own account says its list goes on can have missed it.
  return listGoesOn(summary.reads ?? []) ? undefined : `Core holds no record of ${quoted} as a row any read saw, and every read's own account says its list ended where it stopped reading.`;
}

/** Why a quote is not the request's own words, word for word (`../../request-rows/request-wording.ts`, `says`); nothing where it is, or Core holds no wording to hold it to. */
function requestWordsUnsaid(words: string, says: ((text: string) => boolean) | undefined): string | undefined {
  if (!says) return undefined;
  const pieces = words.replace(/^[\s"“'‘]+|[\s"”'’.]+$/gu, "").split(/…|\.\.\./u).map((piece) => piece.trim()).filter(Boolean);
  return pieces.length && pieces.every((piece) => says(piece)) ? undefined : `"${words}" are not words the request says.`;
}

/**
 * The rows a defect's `row` names in the record (header, t771): a stored or
 * left-out row by its whole label, by Core's id for it, or by its whole label
 * first and more words after it ("<label> — <more>"), those words then telling
 * apart rows that share the label by a cell they name; never a label found
 * further on in its words, which is another row's (run `run-mvrj7qg8-c20c132e`:
 * "<author> — <group>, <date>" was taken for the stored row labelled <group>).
 * A left-out row that the result also holds is a stored row. `seen` where a
 * read saw a row by that label, left out by two conditions together or kept by
 * a read and not stored; `cells`, the records of its own cells Core holds.
 */
function rowsNamed(row: string, record: AutomationStudioResultNoRecord, leftOutCells: ReadonlyMap<string, ReadonlyArray<Record<string, string>>>): Named {
  const text = AutomationStudioRequestRowId.unsaid(row).replace(/^["“'‘]+|["”'’]+$/gu, "").trim();
  const key = fold(text);
  const labels = [...new Set([...record.stored.map((one) => one.label), ...record.leftOut.map((one) => one.label), ...(record.seenLabels ?? []), ...record.pools.flat()])];
  const whole = labels.find((label) => fold(label) === key);
  if (whole !== undefined) return named(whole, "", record, leftOutCells);
  const ids = new Set([...text.matchAll(ROW_ID)].map((found) => found[1]!));
  const byId = ids.size ? labels.filter((label) => ids.has(AutomationStudioRequestRowId.of(label))) : [];
  if (byId.length === 1) return named(byId[0]!, "", record, leftOutCells);
  // The longest label the words start with, whole, before a separator.
  const first = labels.filter((label) => {
    const folded = fold(label);
    return folded.length > 0 && key.startsWith(folded) && LEADS_ON.test(key.slice(folded.length));
  }).sort((a, b) => b.length - a.length)[0];
  if (first !== undefined) return named(first, key.slice(fold(first).length), record, leftOutCells);
  return { stored: [], leftOut: [], seen: false, cells: [] };
}

type Named = { stored: AutomationStudioResultNoStoredRow[]; leftOut: AutomationStudioResultNoLeftOutRow[]; seen: boolean; cells: ReadonlyArray<Record<string, string>>; label?: string };

/** Core's id for a label, as the judge's copy writes one (`../request-rows/row-id.ts`). */
const ROW_ID = /\b([A-HJ-NP-Z2-9]{6})\b/gu;
/** What may follow a whole label that names a row first: a separator, then more words. */
const LEADS_ON = /^\s*[—–\-,:;(|·]/u;

/**
 * The rows labelled `label`, stored and left out; where `rest` names a cell of
 * some of them and not of the others, only those (header).
 */
function named(label: string, rest: string, record: AutomationStudioResultNoRecord, leftOutCells: ReadonlyMap<string, ReadonlyArray<Record<string, string>>>): Named {
  const key = fold(label);
  let stored = record.stored.filter((one) => fold(one.label) === key);
  let cells: ReadonlyArray<Record<string, string>> = leftOutCells.get(automationStudioResultLeftOutLabelKey(label)) ?? [];
  const leftOut = record.leftOut.filter((one) => fold(one.label) === key);
  const told = (row: Readonly<Record<string, string>>): boolean => rest.length > 0 && Object.values(row).some((cell) => {
    const folded = fold(cell);
    return folded.length >= 3 && folded !== key && rest.includes(folded);
  });
  // The words after the label tell apart rows that share it, where they name a cell of some (header).
  const storedTold = stored.filter((one) => told(one.cells));
  const cellsTold = cells.filter(told);
  if (storedTold.length || cellsTold.length) {
    stored = storedTold;
    cells = cellsTold;
  }
  if (stored.length) return { stored, leftOut: [], seen: true, cells: [], label };
  return { stored: [], leftOut, seen: true, cells, label };
}

/**
 * Why a row a read left out is not found to be one the request asks for by its
 * own cells, or nothing where it is (header, t771): the no names the column and
 * quotes the row's value in it that makes the row asked for, and Core holds
 * that cell of the row and it says that value. Where Core holds no cell of
 * that column -- a read that sent the row by its label only, as a build's test
 * does -- the row's label is its own words, and the value is found where the
 * label says it. A claim about a row's group, date or kind that its own cells
 * do not bear out is no defect Core finds.
 */
function askedCellNotFound(defect: Defect, quoted: string, cells: ReadonlyArray<Record<string, string>>, label: string | undefined): string | undefined {
  const column = bare(defect.column ?? "");
  const value = defect.value === undefined ? "" : fold(defect.value);
  if (!column || !value) return `${quoted} is a row a read saw and left out, but the defect names no column and value of that row which make it a row the request asks for: name the column and quote that row's own value in it.`;
  // The column by its own name where a row has it, else the one column whose name holds it or it holds.
  const keys = [...new Set(cells.flatMap((row) => Object.keys(row)))];
  const exact = keys.filter((key) => bare(key) === column);
  const near = keys.filter((key) => Math.min(bare(key).length, column.length) >= 3 && (bare(key).includes(column) || column.includes(bare(key))));
  const named = new Set(exact.length ? exact : near.length === 1 ? near : []);
  const held = cells.flatMap((row) => Object.entries(row).filter(([key]) => named.has(key)).map(([, cell]) => cell));
  if (!held.length) {
    if (label !== undefined && value.length >= 3 && fold(label).includes(value)) return undefined;
    return `Core holds no cell "${defect.column}" of ${quoted}, and its label does not say "${defect.value}", so whether the request asks for that row is unconfirmed.`;
  }
  if (held.some((cell) => fold(cell) === value || (value.length >= 3 && fold(cell).includes(value)))) return undefined;
  const said = [...new Set(held.map((cell) => (cell.trim() ? `"${cell}"` : "no value")))].join(" or ");
  return `Core's record of ${quoted} holds ${said} in "${defect.column}", not "${defect.value}".`;
}

/** Whether a stored row's own cells, or the answer's record sets, hold a column by that name, compared without case, spaces or marks. */
function storedColumn(column: string, rows: readonly AutomationStudioResultNoStoredRow[], summary: Context["summary"]): string | undefined {
  const wanted = bare(column);
  if (!wanted) return undefined;
  const working = automationStudioResultReadWorkingSets(summary);
  const columns = [...rows.flatMap((one) => Object.keys(one.cells)), ...summary.recordSets.filter((set) => !working.has(set.datasetId)).flatMap((set) => set.columns)].map(bare);
  // "renewals left" names the column `renewals`, and `dueDate` the words "due date".
  const unique = [...new Set(columns)];
  if (unique.includes(wanted)) return wanted;
  const aliases = unique.filter((id) => Math.min(id.length, wanted.length) >= 3 && (id.includes(wanted) || wanted.includes(id)));
  return aliases.length === 1 ? aliases[0] : undefined;
}

/**
 * Whether any read's own account says its list goes on past what it read: one
 * part of a list read with a way on (`../../read-account/list-continues.ts`),
 * or a read that pages whose paging stopped other than at the list's end
 * (`../../read-account/stop.ts`).
 */
function listGoesOn(reads: readonly AutomationStudioResultReadAccount[]): boolean {
  const pages = (read: AutomationStudioResultReadAccount): boolean => read.paginates === true || read.pagesRead > 1 || (read.keptPerPage?.length ?? 0) > 1;
  return reads.some((read) => automationStudioResultReadListContinues(read) !== undefined || (pages(read) && automationStudioResultReadStop(read) !== "list_ended"));
}

/** A label as labels are compared: lower case, each run of spaces one, no closing stop or comma. */
function fold(text: string): string {
  return text.toLowerCase().replace(/\s+/gu, " ").replace(/[\s.,;:]+$/u, "").trim();
}

/** A column name as columns are compared: letters and digits only, lower case. */
function bare(text: string): string {
  return text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
}
