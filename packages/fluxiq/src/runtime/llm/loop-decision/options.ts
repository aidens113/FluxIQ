// Which decisions a caught repeat offers (user, 2026-11-19: "it seems to be asking the user too quickly
// for input when continuing after flow looping behavior happens"). Asking the person is the last resort:
// it is offered only once the same attempt has already changed approach and the model ladder has climbed
// (or has nothing to climb). Until then the model is asked to try its own options first. The tool itself
// is offered from the first decision and never changes (`./offered.ts`); what changes is this list, which
// the ask names and the decision's handler enforces.

import { AUTOMATION_STUDIO_LLM_LOOP_DECISIONS, type AutomationStudioLlmLoopDecisionKind } from "./tool-id.ts";

/** What the attempt has already tried, as facts. */
export type AutomationStudioLlmLoopDecisionFacts = {
  /** Approaches already changed in this attempt: the model's own `change_approach` decisions and the ladder's fresh approaches, the larger. */
  approachesChanged: number;
  /** The model ladder has been climbed at least once, or has no higher rung to climb. */
  climbedOrAtTop: boolean;
};

/** The decisions offered, and why, for the step's meta. */
export type AutomationStudioLlmLoopDecisionOptions = {
  offered: readonly AutomationStudioLlmLoopDecisionKind[];
  /** Why `ask_person` is offered or not, in Core's words. */
  askPerson: "offered" | "after_change_approach" | "after_model_climb";
  approachesChanged: number;
  climbedOrAtTop: boolean;
};

export function automationStudioLlmLoopDecisionOptions(facts: AutomationStudioLlmLoopDecisionFacts): AutomationStudioLlmLoopDecisionOptions {
  const changed = facts.approachesChanged >= 1;
  const askPerson = !changed ? "after_change_approach" : !facts.climbedOrAtTop ? "after_model_climb" : "offered";
  return {
    offered: AUTOMATION_STUDIO_LLM_LOOP_DECISIONS.filter((decision) => decision !== "ask_person" || askPerson === "offered"),
    askPerson,
    approachesChanged: facts.approachesChanged,
    climbedOrAtTop: facts.climbedOrAtTop
  };
}
