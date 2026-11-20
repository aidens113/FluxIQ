// The ladder's last step as the loop raises it (`../repeat-guard/loop-detection/watch.ts`).
//
// **What the Exploration lane wires.** It hands the loop `attemptRecord` and
// `loopSignal` (`../loop-configuration.ts`). On `change_approach` it answers
// `end`, and starts a fresh loop from the page as it stands, with the same record
// and with its `data().tried` as the list of what was already tried, steered off
// what the loop repeated (`data().stoppedOn`).
// It also gives `askedRepeats`, from the act record, for a task that really asks
// for one act several times: past that count, or past one repeat when it says
// nothing, a lasting act is refused.
// Today's callers give neither and end as a stall has always ended.
//
// **A `change_approach` climbs the model ladder one rung** (`../role-routing/ladder/`, t962): the
// steer and the refusals did not stop the loop on the model it is on. At the top it climbs nothing,
// and the loop is stopped and steered again until the purse ends it. An `ask_person` is raised
// only where the model itself decided to ask (`./model-decision.ts`): it carries the model's
// question, climbs nothing, and the caller posts it.

import type { AutomationStudioLlmLoopSignal, AutomationStudioLlmLoopSignalAnswer } from "../repeat-guard/loop-detection/index.ts";
import { AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_CHECK_TOOL_ID, AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_SIGNAL_CODES, automationStudioLlmLoopStepFolder } from "../repeat-guard/loop-detection/index.ts";
import { automationStudioLlmModelLadderClimb } from "../role-routing/index.ts";
import type { AutomationStudioLlmEvidenceDecisionHandlerContext } from "./types.ts";

/** Puts a signal on the run's record and asks the caller. With no caller to ask, it ends as a stall does. */
export function automationStudioLlmEvidenceLoopRaise(context: AutomationStudioLlmEvidenceDecisionHandlerContext, iteration: number, signal: AutomationStudioLlmLoopSignal): AutomationStudioLlmLoopSignalAnswer {
  context.recordRow({ iteration, decision: "tool_call", toolId: signal.toolIds.at(-1) ?? AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_CHECK_TOOL_ID, resultCode: AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_SIGNAL_CODES[signal.kind], resultReason: signal.pattern });
  automationStudioLlmLoopStepFolder(iteration, signal.kind, signal);
  if (signal.kind === "change_approach") automationStudioLlmModelLadderClimb(context.loops.record.ladder, { reason: "loop_persisted", pattern: signal.pattern }, iteration);
  const answer = context.input.loopSignal?.(signal) ?? "end";
  if (answer === "continue") context.loops.signalAnswered();
  return answer;
}
