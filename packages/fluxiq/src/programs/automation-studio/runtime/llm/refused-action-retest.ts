// A refused action is remembered as answered only until the next call runs.
//
// **The dead end this closes.** Live run office r2 (`run-mvfq94ff-c8c21493`,
// steps 0096-0110): a trial action was refused unrun, `ok: false` with nothing
// applied, until the model read a list. The model read it -- a look -- and sent
// the identical trial again. An action's request signature is keyed on
// `mutationEpoch` (`./repeat-policy.ts`), and a look moves neither epoch, so the
// retry carried the refused call's signature and was answered
// `llm_evidence_loop.already_answered` from memory seven times. The precondition
// the look satisfied could never be checked again.
//
// **The rule.** When an action (a tool whose effect is `mutate`, or one whose
// calls declare their own effect) applied nothing and answered `ok: false`, its
// signature stays answered only until the next call runs, whatever that call is,
// a look included. With no call between, the identical request is still answered
// from memory, exactly as before. After any call, it runs and reaches its tool.
//
// **What still bounds it.** A refused action applied nothing, so it is a step
// without progress (`automationStudioLlmEvidenceNothingHappened`), and a look
// answering what it answered before is one too (`./evidence-progress/`). So
// refuse, look, refuse, look ... ends `llm_evidence_loop.repeat_without_progress`
// as the guard is configured.

import type { AutomationStudioLlmEvidenceTool } from "./evidence-loop.ts";
import { automationStudioLlmEvidenceNothingHappened } from "./repeat-policy.ts";

/** The one refused action's signature held answered until the next call runs (header). */
export type AutomationStudioLlmEvidenceRefusedActionRetest = {
  /** A call is about to run: the refused action held since the last call is no longer answered. */
  callRan(): void;
  /** A call ran and answered: held when it was an action that applied nothing and said `ok: false`. */
  settled(signature: string, tool: AutomationStudioLlmEvidenceTool, result: { evidence: unknown; effectApplied: boolean }): void;
};

/** A fresh holder over the loop's own answered requests (header). */
export function automationStudioLlmEvidenceRefusedActionRetest(answeredRequests: Map<string, string>): AutomationStudioLlmEvidenceRefusedActionRetest {
  let held: string | undefined;
  return {
    callRan() {
      if (held !== undefined) answeredRequests.delete(held);
      held = undefined;
    },
    settled(signature, tool, result) {
      const action = tool.effect === "mutate" || tool.perCallEffect === true;
      if (action && automationStudioLlmEvidenceNothingHappened(result)) held = signature;
    }
  };
}
