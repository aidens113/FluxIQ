// The requested columns: present in the result and not empty on every row.
//
// **Which columns are requested.** Those a part's declared answer names
// (`answer.columns`, `../requested-output/owed.ts`) and those the instruction
// names in its own words, read by the one reader the build declares an
// extraction's columns by (`automationStudioFlowBootstrapInstructionColumns`,
// whose matcher `../read-account/unread-columns.ts` also says to the judge).
// Never a column read off the page.
//
// **Which columns are stored.** The schema columns of each record set that can
// hold the answer -- every set less the working rows Core sets aside
// (`../read-account/working-sets.ts`) -- on a finished run whose every set is
// summarised and none of whose column lists was cut. A build test stores no
// record set and its stores name rows by label only, so it has no fact here.
//
// **A requested column is missing** where no stored column is it: none is the
// same name, or the same once case and separators are set aside ("Shelf-Mark"
// is `shelf_mark`, the build's own matcher). A name that shares a word with a
// stored column without being it ("book title" beside `title`) may be that
// column under another spelling, which only a reading of the request can say:
// no fact. **A requested column is empty** where it is stored and every stored
// row, all of them read back, holds it as nothing (an empty or blank value),
// unless a read's own condition keeps it empty
// (`../read-account/emptied-columns.ts`): the request asked for exactly that.
// A blank cell on some rows is no defect. A withheld value or a column a row
// does not carry at all (which the screen does to a denied column) says
// nothing.
//
// **Only a declared column can fail (t795 integration).** A column the
// instruction names but the build never declared is read from the request's
// English by a matcher, which `../read-account/unread-columns.ts` already says
// to the judge as information, never a refusal. Found stored and filled, it
// counts toward a fact that holds; missing or empty, it leaves no fact, and the
// judge reads that sentence as before.
//
// **The fact.** Fails with one `asked_missing` defect per missing or empty
// declared column, held to the request's words that name it: the column's own name where
// it runs in the request, else the part's words. Holds only where every
// requested column is stored and filled. Anything Core could not settle leaves
// no fact at all, and the judge is asked as before.

import type { JsonObject } from "../../../../../core/index.ts";
import { automationStudioFlowBootstrapInstructionColumns } from "../../flow-bootstrap/index.ts";
import type { AutomationStudioResultComputedDefect, AutomationStudioResultComputedFact, AutomationStudioResultComputedFactsInput, AutomationStudioResultRecordSetSummary } from "../contracts/index.ts";
import { automationStudioResultReadEmptiedColumns, automationStudioResultReadWorkingSets } from "../read-account/index.ts";
import { automationStudioResultRequestedOutputOwed } from "../requested-output/index.ts";

/** What a screened cell reads as in a summary row (`../result-summary.ts`). */
const WITHHELD_VALUE = "[withheld]";

/** One requested column: its name as the request or the part gives it, and the request's words it is held to. */
type Requested = { name: string; requestWords: string; declared: boolean };

/** What Core found of one requested column: filled, missing, empty on every row, or unsettled. */
type Found = "filled" | "missing" | "empty" | "unsettled";

/** The requested columns: present in the result and not empty on every row. None where Core cannot compute it. */
export function automationStudioResultColumnsFact(input: AutomationStudioResultComputedFactsInput): AutomationStudioResultComputedFact[] {
  const { summary } = input;
  if (summary.buildTest || summary.recordSetCount !== summary.recordSets.length) return [];
  const working = automationStudioResultReadWorkingSets(summary);
  const sets = summary.recordSets.filter((set) => !working.has(set.datasetId) && set.recordCount > 0);
  if (!sets.length || sets.some((set) => set.columnsWithheld)) return [];
  const requested = requestedColumns(input);
  if (!requested.length) return [];
  const emptied = new Set(automationStudioResultReadEmptiedColumns(summary.reads, [...new Set(sets.flatMap((set) => set.columns))]));
  const found = requested.map((column) => ({ column, found: settledOf(column, foundOf(column.name, sets, emptied)) }));
  if (found.some((entry) => entry.found === "unsettled")) return [];
  const defects = found.flatMap(({ column, found: one }): AutomationStudioResultComputedDefect[] =>
    one === "filled" ? [] : [{ kind: "asked_missing", row: holderOf(column.name, sets), column: column.name, requestWords: column.requestWords }]);
  const names = requested.map((column) => column.name).join(", ");
  if (!defects.length) return [{ kind: "columns", status: "holds", said: `Settled by Core: every column the request names (${names}) is stored and holds a value on at least one stored row. Do not decide whether a requested column is present again.` }];
  const missing = found.filter((entry) => entry.found === "missing").map((entry) => entry.column.name);
  const empty = found.filter((entry) => entry.found === "empty").map((entry) => entry.column.name);
  const said = [
    ...(missing.length ? [`No stored column is ${missing.join(", ")}, which the request names.`] : []),
    ...(empty.length ? [`${empty.join(", ")}, which the request names, is empty on every stored row.`] : [])
  ].join(" ");
  return [{ kind: "columns", status: "fails", said, defects }];
}

/** The part's columns and the instruction's, each once, in that order, each with the request's words it is held to (header). */
function requestedColumns(input: AutomationStudioResultComputedFactsInput): Requested[] {
  const lower = input.requestText.toLowerCase();
  const runs = (name: string) => lower.includes(name.toLowerCase());
  const owed = automationStudioResultRequestedOutputOwed(input.summary, input.requestedOutput)?.parts ?? [];
  const declared = owed.flatMap((part) => part.columns.map((name) => ({ name, requestWords: runs(name) ? name : partWords(input, part.part), declared: true })));
  const named = automationStudioFlowBootstrapInstructionColumns(input.requestText).map((name) => ({ name, requestWords: name, declared: false }));
  const seen = new Set<string>();
  return [...declared, ...named].filter((column) => {
    const key = keyOf(column.name);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** A column only the instruction's words name settles nothing when it is missing or empty (header). */
function settledOf(column: Requested, found: Found): Found {
  return column.declared || found === "filled" ? found : "unsettled";
}

/** What Core found of one requested column across the answer's sets (header). */
function foundOf(name: string, sets: readonly AutomationStudioResultRecordSetSummary[], emptied: ReadonlySet<string>): Found {
  const holders = sets.flatMap((set) => set.columns.filter((column) => column === name || keyOf(column) === keyOf(name)).map((column) => ({ set, column })));
  if (!holders.length) {
    const words = new Set(wordsOf(name));
    return sets.some((set) => set.columns.some((column) => wordsOf(column).some((word) => words.has(word)))) ? "unsettled" : "missing";
  }
  const cells = holders.flatMap(({ set, column }) => (set.sampleRows ?? []).map((row) => cellOf(row, column)));
  if (cells.includes("value")) return "filled";
  if (holders.some(({ column }) => emptied.has(column))) return "unsettled";
  const allRead = holders.every(({ set }) => (set.sampleRows ?? []).length === set.recordCount);
  return allRead && cells.length > 0 && cells.every((cell) => cell === "empty") ? "empty" : "unsettled";
}

/** What a stored row holds in a column: a value, explicitly nothing, or nothing Core can read (a withheld value, a column the row does not carry). */
function cellOf(row: JsonObject, column: string): "value" | "empty" | "unknown" {
  if (!Object.hasOwn(row, column)) return "unknown";
  const value = row[column];
  if (value === null || (typeof value === "string" && !value.trim())) return "empty";
  return value === WITHHELD_VALUE ? "unknown" : "value";
}

/** The set a defect names: the one holding the column, else the first answer set. */
function holderOf(name: string, sets: readonly AutomationStudioResultRecordSetSummary[]): string {
  return (sets.find((set) => set.columns.some((column) => column === name || keyOf(column) === keyOf(name))) ?? sets[0]!).datasetId;
}

/** The part's own words, as the checklist quotes them; else the request's first instruction. */
function partWords(input: AutomationStudioResultComputedFactsInput, part: string): string {
  const quoted = input.summary.taskChecklist?.asked.find((entry) => entry.part === part)?.words.trim();
  if (quoted && input.requestText.includes(quoted)) return quoted;
  const first = input.instructions.find((instruction) => instruction.body.trim() || instruction.title.trim());
  return first ? first.body.trim() || first.title.trim() : input.requestText.trim();
}

/** A column name with case and separators set aside, as the build matches one (`../../flow-bootstrap/authoring/keys.ts`). */
function keyOf(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/gu, "");
}

/** A column name's words, lower case: split at separators and where a lower-case letter meets an upper-case one. */
function wordsOf(name: string): string[] {
  return name.replace(/([a-z0-9])([A-Z])/gu, "$1 $2").toLowerCase().split(/[^a-z0-9]+/u).filter((word) => word.length > 1);
}
