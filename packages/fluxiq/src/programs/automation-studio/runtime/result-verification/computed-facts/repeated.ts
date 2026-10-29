// Rows the result stores twice.
//
// **What a repeat is, by Core's own record.** On a finished run, two stored
// rows of one answer set that are the same row: equal in every stored column
// (the store's own identity where nothing names another), or equal in every
// column the reads that collected the set identify a row by (`dedupeBy`, the
// same key on each of them) with a value in each. A set Core sets aside as
// working rows (`../read-account/working-sets.ts`) is no answer and is not
// read. Rows a dedupe already took out (`processing.duplicates`) were never
// stored, so they are no repeat. A row holding a withheld value is compared by
// nothing: what was withheld may differ.
//
// **Not a build test's repeated labels.** A build test names its rows by label
// alone, and two rows with one label may differ in every other column
// (`../build-test/stores.ts`): where the test made its answer, they already
// survived the store's dedupe as two rows; where it did not, a run's end would
// dedupe them. Either way `repeated` does not show one row stored twice, so it
// is left to the judge. A made answer (`removed` present) whose every row is
// labelled and no label repeats holds.
//
// **The fact.** Fails with one defect per row stored more than once, named by
// its label (its first column holding text, as every read labels a row) and how
// many times it is stored, held to the clause of the request its rows fall
// under. Holds only where every stored row of every answer set was read back,
// none withheld, and none repeats.

import type { JsonObject, JsonValue } from "../../../../../core/index.ts";
import type {
  AutomationStudioResultComputedDefect,
  AutomationStudioResultComputedFact,
  AutomationStudioResultComputedFactsInput,
  AutomationStudioResultRecordSetSummary,
  AutomationStudioRunResultSummary
} from "../contracts/index.ts";
import { automationStudioResultReadWorkingSets } from "../read-account/index.ts";

/** What a screened cell reads as in a summary row (`../result-summary.ts`). */
const WITHHELD_VALUE = "[withheld]";

/** One answer set's repeats, by label and how many times each is stored, and whether every row was compared. */
type SetRepeats = { repeats: Array<{ label: string; times: number }>; complete: boolean };

/** Rows the result stores twice. None where Core cannot compute it. */
export function automationStudioResultRepeatedFact(input: AutomationStudioResultComputedFactsInput): AutomationStudioResultComputedFact[] {
  const { summary } = input;
  if (summary.buildTest) return buildTestFact(summary);
  const working = automationStudioResultReadWorkingSets(summary);
  const sets = summary.recordSets.filter((set) => !working.has(set.datasetId) && set.recordCount > 0);
  if (!sets.length) return [];
  const found = sets.map((set) => ({ set, ...repeatsOf(set, identityOf(summary, set)) }));
  const words = clauseWords(input);
  const defects = found.flatMap(({ repeats }) => repeats.map(({ label, times }): AutomationStudioResultComputedDefect => ({ kind: "other", row: label, value: `stored ${times} times`, requestWords: words })));
  if (defects.length) {
    const named = defects.map((defect) => `"${defect.row}" (${defect.value})`).join(", ");
    return [{ kind: "repeated", status: "fails", said: `The answer stores the same row more than once: ${named}. Each row the request asks for is stored once.`, defects }];
  }
  const complete = summary.recordSetCount === summary.recordSets.length && found.every((entry) => entry.complete);
  return complete ? [{ kind: "repeated", status: "holds", said: "Settled by Core: every stored row of the answer is stored once. Do not decide whether a row is stored twice again." }] : [];
}

/** A build test's would-be answers: holds where each was made and labels every row once; otherwise nothing (header). */
function buildTestFact(summary: AutomationStudioRunResultSummary): AutomationStudioResultComputedFact[] {
  const stores = summary.buildTest?.stores ?? [];
  const clean = stores.length > 0 && stores.every((store) => store.removed !== undefined && !store.repeated?.length && store.answer.labels.length === store.answer.rows);
  return clean ? [{ kind: "repeated", status: "holds", said: "Settled by Core: every row the Flow would store, as this test made its answer, is stored once. Do not decide whether a row is stored twice again." }] : [];
}

/** The columns every read that collected the set identifies a row by, where they all name the same stored columns; undefined otherwise. */
function identityOf(summary: AutomationStudioRunResultSummary, set: AutomationStudioResultRecordSetSummary): string[] | undefined {
  const collectors = [...new Set((set.processing?.passes ?? []).map((pass) => pass.node))];
  const keys = collectors.map((node) => (summary.reads ?? []).find((read) => read.nodeId === node)?.dedupeBy);
  const first = keys[0];
  if (!first?.length || !first.every((column) => set.columns.includes(column))) return undefined;
  return keys.every((key) => key !== undefined && key.length === first.length && key.every((column, index) => column === first[index])) ? first : undefined;
}

/** The set's rows stored more than once, whole or by `identity`, and whether every stored row was compared (header). */
function repeatsOf(set: AutomationStudioResultRecordSetSummary, identity: readonly string[] | undefined): SetRepeats {
  const rows = set.sampleRows ?? [];
  // A row with a withheld value, or with no value in any stored column, is no row Core can tell from another (t795 integration: a summary whose rows carry no readable cells read as one row stored three times).
  const comparable = rows.filter((row) => !Object.values(row).some((value) => value === WITHHELD_VALUE) && set.columns.some((column) => present(row[column])));
  const counted = new Map<string, { label: string; times: number }>();
  const count = (key: string | undefined, row: JsonObject) => {
    if (key === undefined) return;
    const entry = counted.get(key) ?? { label: labelOf(row, set.columns), times: 0 };
    entry.times += 1;
    counted.set(key, entry);
  };
  for (const row of comparable) {
    const whole = `row:${JSON.stringify(set.columns.map((column) => row[column] ?? null))}`;
    const keyed = identity && identity.every((column) => present(row[column])) ? `key:${JSON.stringify(identity.map((column) => row[column]))}` : undefined;
    // A row repeated whole is said once, not again by its key.
    if ((counted.get(whole)?.times ?? 0) > 0) count(whole, row);
    else if (keyed !== undefined && (counted.get(keyed)?.times ?? 0) > 0) count(keyed, row);
    else {
      count(whole, row);
      count(keyed, row);
    }
  }
  const repeats = [...counted.values()].filter((entry) => entry.times > 1);
  return { repeats, complete: rows.length === set.recordCount && comparable.length === rows.length };
}

/** A row's label: its first column holding text, as a read labels a row; else its first value. */
function labelOf(row: JsonObject, columns: readonly string[]): string {
  const column = columns.find((id) => typeof row[id] === "string" && (row[id] as string).trim().length > 0);
  return column === undefined ? JSON.stringify(columns.map((id) => row[id] ?? null)) : (row[column] as string);
}

function present(value: JsonValue | undefined): boolean {
  return value !== undefined && value !== null && !(typeof value === "string" && !value.trim());
}

/** The clause of the request every stored row falls under: the one part's words where the checklist has one part asking records, else the request's first instruction. */
function clauseWords(input: AutomationStudioResultComputedFactsInput): string {
  const parts = (input.summary.taskChecklist?.asked ?? []).filter((part) => part.answer?.kind === "records");
  const quoted = parts.length === 1 ? parts[0]!.words.trim() : undefined;
  if (quoted && input.requestText.includes(quoted)) return quoted;
  const first = input.instructions.find((instruction) => instruction.body.trim() || instruction.title.trim());
  const words = first ? first.body.trim() || first.title.trim() : input.requestText.trim();
  return words || "the request";
}
