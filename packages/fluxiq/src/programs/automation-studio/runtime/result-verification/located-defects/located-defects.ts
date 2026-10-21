import type { AutomationStudioLlmVerificationDefect } from "../../llm/index.ts";
import type { AutomationStudioResultReadAccount, AutomationStudioRunResultSummary } from "../contracts/index.ts";
import { automationStudioResultReadListContinues, automationStudioResultReadStop, automationStudioResultReadWorkingSets } from "../read-account/index.ts";
import {
  automationStudioResultLeftOutFinding,
  automationStudioResultSentenceRows,
  type AutomationStudioResultNoLeftOutRow,
  type AutomationStudioResultNoRecord,
  type AutomationStudioResultNoStoredRow
} from "../refuted-no/index.ts";
import { AutomationStudioRequestRowId } from "../request-rows/index.ts";

type Defect = AutomationStudioLlmVerificationDefect;

/**
 * Which of a no's defects Core finds in its own record of the result (header,
 * `./index.ts`), and Core's words for each it does not: `located` in the order
 * listed, `findings` one sentence per defect not found.
 */
export function automationStudioResultDefectsLocated(
  defects: readonly Defect[],
  context: { record: AutomationStudioResultNoRecord; summary: Pick<AutomationStudioRunResultSummary, "reads" | "recordSets"> }
): { located: Defect[]; findings: string[] } {
  const located: Defect[] = [];
  const findings: string[] = [];
  for (const defect of defects) {
    const missing = notFound(defect, context);
    if (missing === undefined) located.push(defect);
    else findings.push(missing);
  }
  return { located, findings };
}

/** Why Core does not find one defect in its record, or nothing where it does. */
function notFound(defect: Defect, context: { record: AutomationStudioResultNoRecord; summary: Pick<AutomationStudioRunResultSummary, "reads" | "recordSets"> }): string | undefined {
  const { record, summary } = context;
  // Core cannot locate non-row requirements by row membership. Keep the uncertainty explicit; never infer correctness from this boundary.
  if (defect.kind === "other") return "This requirement is not measurable by Core\'s row-membership checks; it remains unconfirmed against the original request.";
  const unsaid = requestWordsUnsaid(defect.requestWords, record.says);
  if (unsaid) return unsaid;
  const quoted = `"${defect.row}"`;
  const rows = rowsNamed(defect.row, record);
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
  if (rows.leftOut.length) return rows.leftOut.some((row) => !row.quotesRequest) ? undefined : [...new Set(rows.leftOut.map(automationStudioResultLeftOutFinding))].join(" ");
  if (rows.seen) return undefined;
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
 * The rows a defect's `row` names in the record: a stored or left-out row by
 * its whole label, else by Core's id or the start of its label as any no's
 * sentence names one (`../../refuted-no/named-rows.ts`); a left-out row that
 * the result also holds is a stored row. `seen` where a read saw a row by that
 * label, left out by two conditions together or kept by a read and not stored.
 */
function rowsNamed(row: string, record: AutomationStudioResultNoRecord): { stored: AutomationStudioResultNoStoredRow[]; leftOut: AutomationStudioResultNoLeftOutRow[]; seen: boolean } {
  const key = fold(AutomationStudioRequestRowId.unsaid(row).replace(/^["“'‘]+|["”'’]+$/gu, ""));
  const stored = record.stored.filter((one) => fold(one.label) === key);
  if (stored.length) return { stored, leftOut: [], seen: true };
  const leftOut = record.leftOut.filter((one) => fold(one.label) === key);
  if (leftOut.length) return { stored: [], leftOut, seen: true };
  const named = automationStudioResultSentenceRows(row, record);
  if (named.stored.length || named.leftOut.length) return { stored: named.stored, leftOut: named.leftOut, seen: true };
  return { stored: [], leftOut: [], seen: key.length > 0 && [...(record.seenLabels ?? []), ...record.pools.flat()].some((label) => fold(label) === key) };
}

/** Whether a stored row's own cells, or the answer's record sets, hold a column by that name, compared without case, spaces or marks. */
function storedColumn(column: string, rows: readonly AutomationStudioResultNoStoredRow[], summary: Pick<AutomationStudioRunResultSummary, "reads" | "recordSets">): string | undefined {
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
