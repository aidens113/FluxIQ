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
  describe: ((call: { toolId: string; value: JsonObject }) => { target?: string | undefined } | undefined) | undefined;
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
  const gated = automationStudioAttemptActGate({
    record: input.record,
    executeTool: stored,
    ...(input.readRowsKey ? { readRowsKey: input.readRowsKey } : {}),
    wordsOf: (call) => {
      const target = input.describe?.(call)?.target;
      return target ? { what: target } : undefined;
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

function refusedAnswer(answer: JsonValue | AutomationStudioLlmEvidenceToolExecutionResult): boolean {
  if (!isExecution(answer)) return false;
  const evidence = answer.evidence;
  return answer.failure !== undefined || (typeof evidence === "object" && evidence !== null && !Array.isArray(evidence) && evidence.ok === false);
}

function isExecution(answer: JsonValue | AutomationStudioLlmEvidenceToolExecutionResult): answer is AutomationStudioLlmEvidenceToolExecutionResult {
  return typeof answer === "object" && answer !== null && !Array.isArray(answer) && answer.kind === "llm_evidence_tool_execution";
}
