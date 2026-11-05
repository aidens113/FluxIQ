// What every tool call of an attempt goes through, in the order the design fixes:
//
//   permission gate -> act gate -> row sink -> the domain
//
// The permission gate is the build's own (`flow-bootstrap/action-permissions.ts`), and wraps what
// this returns. A forward run's passes reach this too, because each is sent through the loop's
// executor. The first lasting act reads the "before" witness first, and only then is dispatched.
//
// **What the sink is told is the call's answer alone**, never a model's words (plan D9), and
// the chain counts what reached the domain as the attempt's live steps.
//
// **Nothing is put back on this path (D1).** A forward run sends no reset by construction, but a
// model's `amend_draft` rerun of a step on another page would (`../../../../../runtime/llm/node-tools/step-place.ts`),
// taking the page away from what the attempt did. It is refused here, before anything is sent, and
// the rerun then runs nothing and says so.
//
// **What the domain says of a call is asked for here (`describe`).** A person's words for an act,
// and what the call would be before it is sent, which the act gate reads beside the call (t870:
// a by-hand press by a handle says nothing else). It is asked for every call, so an answer that
// throws or has another shape is no answer, and never stops the call.

import type { JsonObject, JsonValue } from "../../../../../core/index.ts";
import { automationStudioAttemptActGate, type AutomationStudioAttemptActRecord } from "../../../../../runtime/answer-first/act-record/index.ts";
import { automationStudioFlowDraftDeclaresLasting } from "../../../../../runtime/flow-authoring/draft/index.ts";
import type { AutomationStudioHarnessOptionLoopBinding, AutomationStudioLlmEvidenceToolExecutionResult } from "../../../../../runtime/llm/index.ts";
import type { AutomationStudioAnswerFirstRowSink } from "../rows/index.ts";
import type { AutomationStudioAnswerFirstWitnesses } from "../witnesses/index.ts";

type Execute = AutomationStudioHarnessOptionLoopBinding["executeTool"];

const NO_RESET_CODE = "answer_first.no_reset";
const NO_RESET_SAID = "Nothing is put back on this task, so this was not done. Carry on from the page as it stands; to get to another page, go there.";

/** The chain under the permission gate (header). */
export function automationStudioAnswerFirstCallChain(input: {
  domain: Execute;
  record: AutomationStudioAttemptActRecord;
  sink: Pick<AutomationStudioAnswerFirstRowSink, "fromCall">;
  witnesses: Pick<AutomationStudioAnswerFirstWitnesses, "beforeFirstLastingAct">;
  readRowsKey: string | undefined;
  describe: ((call: { toolId: string; value: JsonObject }) => { target?: string | undefined; wouldRunWith?: JsonObject | undefined } | undefined) | undefined;
  /** One call reached the domain. */
  stepped(): void;
  /** A call was answered and not refused: the page has got to where the work starts. */
  answered(): void;
}): Execute {
  const stored: Execute = async (call) => {
    input.stepped();
    const answer = await input.domain(call);
    if (!refusedAnswer(answer)) input.answered();
    if (isExecution(answer)) await input.sink.fromCall({ callId: call.callId, toolId: call.toolId, value: call.value }, answer);
    return answer;
  };
  const described = (call: { toolId: string; value: JsonObject }) => {
    try {
      return { said: input.describe?.(call) };
    } catch {
      return { threw: true as const };
    }
  };
  const gated = automationStudioAttemptActGate({
    record: input.record,
    executeTool: stored,
    ...(input.readRowsKey ? { readRowsKey: input.readRowsKey } : {}),
    wordsOf: (call, answer) => {
      const about = described(call);
      const named = "said" in about ? about.said?.target : undefined;
      // A press by hand may name no handle the build was shown: then what it pressed is in its own answer (`draft.control`), and that is what a person reads, not a line for its class.
      const target = typeof named === "string" && named ? named : isExecution(answer as JsonValue) ? (answer as AutomationStudioLlmEvidenceToolExecutionResult).draft?.control : undefined;
      return target ? { what: target } : undefined;
    },
    foresee: (call) => {
      const about = described(call);
      if (!("said" in about) || typeof about.said !== "object" || about.said === null) return undefined;
      const { target, wouldRunWith } = about.said;
      return { ...(typeof target === "string" ? { words: target } : {}), ...(isObject(wouldRunWith) ? { parameters: wouldRunWith } : {}) };
    }
  });
  return async (call) => {
    if (call.value.replay === "reset") return { kind: "llm_evidence_tool_execution", evidence: { ok: false, code: NO_RESET_CODE, instruction: NO_RESET_SAID }, effectApplied: false, targetsUnchanged: true, resultCode: NO_RESET_CODE };
    if (declaresLasting(call.value)) await input.witnesses.beforeFirstLastingAct();
    return await gated(call);
  };
}

/** A call that says it does something lasting, and is not only a check of a step. */
function declaresLasting(value: JsonObject): boolean {
  if (value.replay === "verify" || value.replay === "reset" || value.write === true) return false;
  const nested = value.parameters;
  const inner = typeof nested === "object" && nested !== null && !Array.isArray(nested) ? nested.consequences : undefined;
  return automationStudioFlowDraftDeclaresLasting(value.consequences) || automationStudioFlowDraftDeclaresLasting(inner);
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function refusedAnswer(answer: JsonValue | AutomationStudioLlmEvidenceToolExecutionResult): boolean {
  if (!isExecution(answer)) return false;
  const evidence = answer.evidence;
  return answer.failure !== undefined || (typeof evidence === "object" && evidence !== null && !Array.isArray(evidence) && evidence.ok === false);
}

function isExecution(answer: JsonValue | AutomationStudioLlmEvidenceToolExecutionResult): answer is AutomationStudioLlmEvidenceToolExecutionResult {
  return typeof answer === "object" && answer !== null && !Array.isArray(answer) && answer.kind === "llm_evidence_tool_execution";
}
