// The ladder's last two steps as the loop raises them (`../repeat-guard/loop-detection/watch.ts`).
//
// **What the Exploration lane wires.** It hands the loop `attemptRecord` and
// `loopSignal` (`../loop-configuration.ts`). On `change_approach` it answers
// `end`, and starts a fresh loop from the page as it stands, with the same record
// and with its `data().tried` as the list of what was already tried; on
// `ask_person` it answers `end`, keeps the best result and the draft, and asks.
// It also gives `askedRepeats`, from the act record, for a task that really asks
// for one act several times: past that count, or past one repeat when it says
// nothing, a lasting act is refused.
// Today's callers give neither and end as a stall has always ended.

import type { AutomationStudioLlmLoopSignal, AutomationStudioLlmLoopSignalAnswer } from "../repeat-guard/loop-detection/index.ts";
import { AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_CHECK_TOOL_ID, AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_SIGNAL_CODES, automationStudioLlmLoopStepFolder } from "../repeat-guard/loop-detection/index.ts";
import type { AutomationStudioLlmEvidenceDecisionHandlerContext } from "./types.ts";

/** Puts a signal on the run's record and asks the caller. With no caller to ask, it ends as a stall does. */
export function automationStudioLlmEvidenceLoopRaise(context: AutomationStudioLlmEvidenceDecisionHandlerContext, iteration: number, signal: AutomationStudioLlmLoopSignal): AutomationStudioLlmLoopSignalAnswer {
  context.recordRow({ iteration, decision: "tool_call", toolId: signal.toolIds.at(-1) ?? AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_CHECK_TOOL_ID, resultCode: AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_SIGNAL_CODES[signal.kind], resultReason: signal.pattern });
  automationStudioLlmLoopStepFolder(iteration, signal.kind, signal);
  const answer = context.input.loopSignal?.(signal) ?? "end";
  if (answer === "continue") context.loops.signalAnswered();
  return answer;
}
