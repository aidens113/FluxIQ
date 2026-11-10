// What a run of the Flow's steps tells the model about the result's list (live run run-mwafor01-bb471f52, cause 1d).
//
// A read that changes which rows the answer-first result holds carries Core's note on its own answer
// (`resultList`, `framework/automation-service/service/answer-first/rows/result-change.ts`). A pass inside
// `core.run_flow` is such a call, but the model sees only the run's summary, so a switch made inside the run
// was never shown. The run's answer carries it instead: the note of the first pass that changed the result (what
// the result held before the run, and what to do about it) with the result as the last such pass left it.
// Passes that changed nothing add nothing, and a run that changed nothing carries no note.
import type { JsonObject, JsonValue } from "../../../../core/index.ts";

/** The passes' answers' evidence, in the order the passes ran, as one `resultList` note for the run; none when no pass carried one. */
export function automationStudioFlowDraftPartResultList(evidences: readonly JsonValue[]): JsonObject | undefined {
  const given = evidences.map((evidence) => isObject(evidence) ? evidence.resultList : undefined).filter(isObject);
  const first = given[0];
  const last = given.at(-1);
  if (!first || !last) return undefined;
  return { ...first, ...("rows" in last ? { rows: last.rows } : {}), ...("pages" in last ? { pages: last.pages } : {}) };
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
