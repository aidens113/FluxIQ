// Advice, never a refusal, for a read's condition that tests a column against
// literal values the request never says (t785, F3 of run `run-mvskodlp-9966d618`).
//
// A request that defines its rows by a property ("clubs I belong to") does not
// name the values that property takes today. A builder that lists the values
// the page shows now writes a condition that is true of today's page only, and
// every judge that reads the result then checks it against that list instead of
// the property. So a submitted `where` condition whose `equals` value, or whose
// list of values, includes words the request does not say is given one note
// beside the accepted revision (`../candidate/authoring-loop.ts`): the values
// are what the page shows today, and where each row itself shows what makes it
// one the request asks for, that is the test. A request that says its values
// gets no note, and nothing here ever blocks a submission.
//
// Reads the assembled plan, as the other checks here do, and finds a condition
// where any step's parameters hold a `where` list. Words only: a condition's
// operator is not judged, and a number, a flag or a pattern is not a value
// listed. "Says" is the request-words rule of `../../result-verification/request-rows/`
// (word for word, case- and plural-insensitive).
//
// **Samples (t800, P7).** Given the sample rows Core holds for the read, the
// note also names a field that separates the rows the listed values keep from
// those they leave out, as the trial's feedback already does (t790,
// `../../service/candidate-trial/row-mark.ts`; the rule is shared in
// `../listed-values/separating-column.ts`). It does so only where one field separates them on
// EVERY sample holding both kinds of row, in generic words: the field's id is
// the Flow's own, and no value a row shows is quoted. No sample, or none that
// agrees, leaves today's note exactly.
import { automationStudioRequestRowWords } from "../../result-verification/request-rows/index.ts";
import type { AutomationStudioFlowBootstrapPlan } from "../plan/index.ts";
import { automationStudioSeparatingColumn } from "../listed-values/index.ts";

/** The members of a condition that hold the literal values it tests a column against. */
const VALUE_KEYS: readonly string[] = ["equals", "in", "oneOf", "anyOf", "values"];
const NOTE = "These values are what the page shows today. Where each row itself shows what makes it one the request asks for, test that instead of listing today's values.";

type Rows = readonly Readonly<Record<string, string>>[];

/**
 * One note per condition whose literal values the request does not say; none where the request names them.
 * `samples`: the sample rows Core holds for the read, one list per read or trial (header).
 */
export function automationStudioFlowPlanListedValuesAdvice(plan: AutomationStudioFlowBootstrapPlan, requestText: string | undefined, samples: readonly Rows[] = []): string[] {
  if (!requestText?.trim()) return [];
  const words = automationStudioRequestRowWords(requestText).map((entry) => entry.word);
  const notes: string[] = [];
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) return value.forEach(visit);
    if (!isRecord(value)) return;
    for (const [key, entry] of Object.entries(value)) {
      if (key === "where" && Array.isArray(entry)) for (const condition of entry) noteOf(condition, words, samples, notes);
      visit(entry);
    }
  };
  for (const subflow of plan.subflows) for (const node of subflow.nodes) visit(node.parameters);
  return [...new Set(notes)];
}

function noteOf(condition: unknown, words: readonly string[], samples: readonly Rows[], notes: string[]): void {
  if (!isRecord(condition)) return;
  const values = VALUE_KEYS.flatMap((key) => literals(condition[key]));
  const unsaid = values.filter((value) => !said(words, value));
  if (!unsaid.length) return;
  const field = typeof condition.field === "string" ? condition.field : undefined;
  const column = field === undefined ? "" : ` for "${field}"`;
  const separating = field === undefined ? undefined : separatingSentence(field, values, samples);
  notes.push(`This condition${column} tests ${unsaid.map((value) => `"${value}"`).join(", ")}, which the request does not say. ${NOTE}${separating ? ` ${separating}` : ""}`);
}

/** The sentence naming the field that marks the rows `values` keep on every sample holding kept and left-out rows; none where no sample does, or the samples disagree. */
function separatingSentence(field: string, values: readonly string[], samples: readonly Rows[]): string | undefined {
  const wanted = new Set(values.map(folded));
  let found: { column: string; said: string; kind: string } | undefined;
  let weighed = 0;
  for (const rows of samples) {
    const listed = rows.filter((row) => wanted.has(folded(row[field] ?? "")));
    const others = rows.filter((row) => !wanted.has(folded(row[field] ?? "")));
    if (!listed.length || !others.length) continue;
    const mark = automationStudioSeparatingColumn(rows, field, listed, others);
    if (!mark) return undefined;
    const kind = "startsWith" in mark.condition ? "startsWith" : mark.said;
    if (found && (found.column !== mark.column || found.kind !== kind)) return undefined;
    found = { column: mark.column, said: mark.said, kind };
    weighed += 1;
  }
  if (!found) return undefined;
  const how = found.kind === "startsWith" ? "starts with a part the kept rows share" : found.said;
  return `In the ${weighed === 1 ? "sample rows" : `${weighed} sets of sample rows`} Core holds, the field "${found.column}" ${how} on every row these values keep and on none of the rows they leave out; testing that field marks the rows by what each row itself shows.`;
}

function literals(value: unknown): string[] {
  if (typeof value === "string") return value.trim() ? [value.trim()] : [];
  return Array.isArray(value) ? value.flatMap((item) => (typeof item === "string" && item.trim() ? [item.trim()] : [])) : [];
}

function folded(value: string): string {
  return value.replace(/\s+/gu, " ").trim().toLowerCase();
}

function said(words: readonly string[], text: string): boolean {
  const run = automationStudioRequestRowWords(text).map((entry) => entry.word);
  if (!run.length) return true;
  for (let start = 0; start + run.length <= words.length; start += 1) {
    if (run.every((word, index) => words[start + index] === word)) return true;
  }
  return false;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
