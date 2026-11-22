// Loop recovery steers the task and preserves its starting model.
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
