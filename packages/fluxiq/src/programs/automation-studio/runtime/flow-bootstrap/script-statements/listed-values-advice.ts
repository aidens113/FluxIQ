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
import { automationStudioRequestRowWords } from "../../result-verification/request-rows/index.ts";
import type { AutomationStudioFlowBootstrapPlan } from "../plan/index.ts";

/** The members of a condition that hold the literal values it tests a column against. */
const VALUE_KEYS: readonly string[] = ["equals", "in", "oneOf", "anyOf", "values"];
const NOTE = "These values are what the page shows today. Where each row itself shows what makes it one the request asks for, test that instead of listing today's values.";

/** One note per condition whose literal values the request does not say; none where the request names them. */
export function automationStudioFlowPlanListedValuesAdvice(plan: AutomationStudioFlowBootstrapPlan, requestText: string | undefined): string[] {
  if (!requestText?.trim()) return [];
  const words = automationStudioRequestRowWords(requestText).map((entry) => entry.word);
  const notes: string[] = [];
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) return value.forEach(visit);
    if (!isRecord(value)) return;
    for (const [key, entry] of Object.entries(value)) {
      if (key === "where" && Array.isArray(entry)) for (const condition of entry) noteOf(condition, words, notes);
      visit(entry);
    }
  };
  for (const subflow of plan.subflows) for (const node of subflow.nodes) visit(node.parameters);
  return [...new Set(notes)];
}

function noteOf(condition: unknown, words: readonly string[], notes: string[]): void {
  if (!isRecord(condition)) return;
  const values = VALUE_KEYS.flatMap((key) => literals(condition[key]));
  const unsaid = values.filter((value) => !said(words, value));
  if (!unsaid.length) return;
  const column = typeof condition.field === "string" ? ` for "${condition.field}"` : "";
  notes.push(`This condition${column} tests ${unsaid.map((value) => `"${value}"`).join(", ")}, which the request does not say. ${NOTE}`);
}

function literals(value: unknown): string[] {
  if (typeof value === "string") return value.trim() ? [value.trim()] : [];
  return Array.isArray(value) ? value.flatMap((item) => (typeof item === "string" && item.trim() ? [item.trim()] : [])) : [];
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
