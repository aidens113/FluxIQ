// Reading a call's answer for the act gate, from what domains really answer.
//
// The loop reads almost none of an answer and neither does this, except what says
// whether an act landed. An act's state comes from the call's result, never from what a
// model said (`design.md`, "A model never decides what landed"). The web domain says:
//
// - `resultReason: "outcome_uncertain"`: a lasting act Core left uncertain and did not
//   repeat (`node-run/retries/uncertain-outcome.ts`), on a run and on a replay alike.
//   `effectApplied` is false there, and the act may well have happened.
// - `evidence.effectUncertain`: a lasting press drew no change through the wait, was not
//   pressed again, and its command stands (`node-run/press-effect/uncertain.ts`).
//   `effectApplied` is true there, and it may well not have happened.
// - `failure.effect: "ambiguous"`: the contract's word for an outcome not known.
// - `evidence.ok === false` or `evidence.status === "no_effect"`: the call refused itself,
//   or a press changed nothing, whatever `effectApplied` says.
// - `draft.effect`: whether the call looked or changed. A call that only reads is never
//   an act whatever it declared (`domain/.../permission.ts`, `run-mueozmp8-348a2057`).
// - `evidence.actedOn`, `evidence.location`, `draft.ranWith`, `outputs`: the row and the
//   frozen target (`../row-ties.ts`, `../identity/target-keys.ts`).

import type { JsonObject, JsonValue } from "../../../../core/index.ts";
import type { AutomationStudioLlmEvidenceToolExecutionResult } from "../../../llm/index.ts";

/** The reason a domain answers an act Core left uncertain with. */
const UNCERTAIN_REASON = "outcome_uncertain";
/** The key a domain's read keeps its rows under when its binding names none (`domain/.../tools.ts`, `readRowsKey`). */
const DEFAULT_READ_ROWS_KEY = "read.extracted";

export type AutomationStudioAttemptActAnswerRead = {
  /** It changed something, as far as its own answer says. */
  applied: boolean;
  uncertain: boolean;
  /** It only read. */
  observe: boolean;
  /** An observation: it read, it answered, and it was not refused. */
  looked: boolean;
  ranWith?: { actionId?: string; parameters?: JsonObject };
  actedOn?: string;
  location?: string;
  /** The answer says the page did not change. */
  pageUnchanged: boolean;
  /** The rows it read, one list per place the answer holds them: the same read's rows there may be written differently, and two rows of one list are never one row. */
  reads: JsonObject[][];
};

/** What the gate reads of an answer (header). A bare JSON answer is a tool's own and says nothing about its effect. */
export function automationStudioAttemptActAnswerRead(answer: JsonValue | AutomationStudioLlmEvidenceToolExecutionResult, readRowsKey: string = DEFAULT_READ_ROWS_KEY): AutomationStudioAttemptActAnswerRead {
  const result = isExecution(answer) ? answer : undefined;
  const evidence = record(result ? result.evidence : answer as JsonValue);
  const refused = evidence?.ok === false || evidence?.status === "no_effect";
  const effect = result?.draft?.effect;
  const uncertain = result?.resultReason === UNCERTAIN_REASON || evidence?.reason === UNCERTAIN_REASON || typeof evidence?.effectUncertain === "string" || result?.failure?.effect === "ambiguous";
  const applied = result ? result.effectApplied === true && !refused : effect !== "observe";
  const observe = effect === "observe";
  const looked = !refused && !uncertain && result?.failure === undefined && (observe || (effect === undefined && !applied));
  const ranWith = result?.draft?.ranWith;
  const parameters = record(ranWith?.parameters);
  const actionId = typeof ranWith?.node === "string" ? ranWith.node : result?.draft?.actionId;
  return {
    applied, uncertain, observe, looked,
    ...(parameters ? { ranWith: { ...(actionId ? { actionId } : {}), parameters } } : {}),
    ...(typeof evidence?.actedOn === "string" ? { actedOn: evidence.actedOn } : {}),
    ...(typeof evidence?.location === "string" ? { location: evidence.location } : {}),
    pageUnchanged: evidence?.pageChanged === false,
    // A refused read kept nothing, whatever its answer holds (`SVC/answer-first/rows/found-rows.ts`).
    reads: refused || result?.failure !== undefined ? [] : [rowsAt(evidence, readRowsKey), ...rowsIn(result?.outputs)].filter((rows) => rows.length > 0)
  };
}

/** The rows at a `holder.member` key of the evidence. */
function rowsAt(evidence: JsonObject | undefined, key: string): JsonObject[] {
  let at: JsonValue | undefined = evidence;
  for (const part of key.split(".")) at = record(at)?.[part];
  return objects(at);
}

/** The rows carried under an output port (`AUTOMATION_STUDIO_NODE_OUTPUTS_KEY`): never shown, the same rows a pass carries. */
function rowsIn(outputs: JsonObject | undefined): JsonObject[][] {
  return Object.values(outputs ?? {}).map(objects);
}

function objects(value: JsonValue | undefined): JsonObject[] {
  return Array.isArray(value) ? value.filter((item): item is JsonObject => record(item) !== undefined) : [];
}

function isExecution(answer: JsonValue | AutomationStudioLlmEvidenceToolExecutionResult): answer is AutomationStudioLlmEvidenceToolExecutionResult {
  return record(answer as JsonValue)?.kind === "llm_evidence_tool_execution";
}

function record(value: JsonValue | undefined): JsonObject | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value : undefined;
}
