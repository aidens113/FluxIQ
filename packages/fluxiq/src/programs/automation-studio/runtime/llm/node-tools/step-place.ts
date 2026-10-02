// A rerun runs from its step's own place in the Flow, never from wherever the
// last call left the target.
//
// **The failure this closes (lane C, t194 runs 11 and 12, earbuds).** A list
// read paginated to page 5, which left the page there. Every rerun of that read
// -- the model correcting its filter -- was then sent as an ordinary call, ran
// on page 5, read one page of 11 items, and answered unfiltered: 0 of 13 rows,
// in the build and in all nine re-author reruns (`run-muq4oaof-464f5bce`,
// `run-muq66ff9-cb3767a1`). The step had recorded where it started; nothing
// used it.
//
// **The rule.** Before a rerun, the target is put back where the step it
// replaces found it: the same reset a replay sends, `{ replay: "reset", from }`
// with that step's own `replay.from` (`./replay.ts`), through the same executor,
// so the same permission gate answers it. A rerun is one step done again, not a
// replay of the Flow from its start, so this belongs to exploration as much as
// to repair.
//
// - A step that recorded no `from` runs where it is: nothing says where else.
// - A step whose recorded page is the page the loop last saw runs where it is,
//   without a reset that would throw away what the page holds.
// - A reset that did not put the target back runs nothing: the rerun is
//   answered with that failure (`rerun_place_unreachable`), never with a read
//   of whatever the target shows.
//
// What a reset puts back is what `from` names -- for the web, an address. State
// a step found that its address does not carry (a filter set by a press on the
// same address) is not restored; the rerun then reads the address fresh, which
// is still the step's own page and never the last one a call reached.
import type { JsonObject, JsonValue } from "../../../../../core/index.ts";
import type { AutomationStudioFlowDraftStep } from "../../flow-draft/index.ts";
import { automationStudioLlmEvidenceParseToolExecutionResult } from "../evidence-loop-decision.ts";
import type { AutomationStudioLlmEvidenceToolExecutionResult } from "../evidence-loop.ts";
import { AUTOMATION_STUDIO_NODE_REPLAY_RESULT_CODES, automationStudioNodeReplayResetCall, automationStudioNodeReplayToolId } from "./replay.ts";

/** The result code of a rerun that ran nothing, because its step's place could not be put back. */
export const AUTOMATION_STUDIO_NODE_RERUN_PLACE_UNREACHABLE_CODE = "llm_evidence_loop.rerun_place_unreachable";

/** Where a rerun runs: as the target stands, after it was put back, or nowhere. */
export type AutomationStudioNodeRerunPlace =
  | { kind: "in_place" }
  | { kind: "put_back"; callId: string }
  /** `result` is what the rerun is answered with, in place of running it. */
  | { kind: "unreachable"; callId: string; result: AutomationStudioLlmEvidenceToolExecutionResult };

/** Puts the target back where `step` found it, when it is not there already. */
export async function automationStudioNodeRerunFromItsPlace(input: {
  step: AutomationStudioFlowDraftStep;
  /** The state the loop last saw the target in, when it saw one. */
  now: string | undefined;
  /** The rerun's own call id; the reset is sent as `<callId>.place`. */
  callId: string;
  executeTool(request: { callId: string; toolId: string; value: JsonObject; signal?: AbortSignal }): Promise<JsonValue | AutomationStudioLlmEvidenceToolExecutionResult>;
  signal?: AbortSignal | undefined;
}): Promise<AutomationStudioNodeRerunPlace> {
  const from = input.step.replay?.from;
  if (!from || (input.now !== undefined && input.now === input.step.stateBefore)) return { kind: "in_place" };
  const callId = `${input.callId}.place`;
  let answered: ReturnType<typeof automationStudioLlmEvidenceParseToolExecutionResult>;
  try {
    const ran = await input.executeTool({ callId, toolId: automationStudioNodeReplayToolId(input.step), value: automationStudioNodeReplayResetCall(from), ...(input.signal ? { signal: input.signal } : {}) });
    answered = automationStudioLlmEvidenceParseToolExecutionResult(ran, "mutate");
  } catch (error) {
    if (input.signal?.aborted) throw error;
    answered = undefined;
  }
  if (answered?.resultCode === AUTOMATION_STUDIO_NODE_REPLAY_RESULT_CODES.replayed && answered.effectApplied === true) return { kind: "put_back", callId };
  return {
    kind: "unreachable",
    callId,
    result: {
      kind: "llm_evidence_tool_execution",
      effectApplied: false,
      resultCode: AUTOMATION_STUDIO_NODE_RERUN_PLACE_UNREACHABLE_CODE,
      evidence: {
        ok: false,
        code: "rerun_place_unreachable",
        detail: "Nothing was run. A rerun runs from the page its step started on, and that page could not be put back, so reading or acting here would not be that step.",
        ...(answered ? { putBack: answered.evidence } : {})
      }
    }
  };
}
