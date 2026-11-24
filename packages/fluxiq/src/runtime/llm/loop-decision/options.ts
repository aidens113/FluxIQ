// Which decisions a caught repeat offers (user, 2026-11-19: "it seems to be asking the user too quickly
// for input", and "model should always give a solid effort, and ONLY stop and ask user for feedback if
// its legit impossible to complete a task under the guidelines given by user"). Asking the person is the
// last resort: it is offered only once the same attempt has already changed approach and a repeat has
// been caught again since, so the loop persists. Until then the model is asked to try its own options.
//
// t969 also gated it on a climb of the model ladder. The ladder is gone (user, 2026-11-20: a task keeps
// the model it starts with), and only that part of the gate went with it. t983 (002650596) removed the
// whole gate by mistake; t1000 restored the rest. The tool itself is offered from the first decision
// and never changes (`./offered.ts`); what changes is this list, which the ask names (`./ask.ts`) and
// the decision's handler enforces (`../decision-handlers/model-decision.ts`).

import { AUTOMATION_STUDIO_LLM_LOOP_DECISIONS, type AutomationStudioLlmLoopDecisionKind } from "./tool-id.ts";

/** What the attempt has already tried, as facts. */
export type AutomationStudioLlmLoopDecisionFacts = {
  /** Approaches already changed in this attempt: the model's own `change_approach` decisions and the watch's fresh approaches, the larger. */
  approachesChanged: number;
  /** A repeat was caught again after the latest change of approach (`../repeat-guard/loop-detection/attempt-record.ts`, `persisting`). */
  persisting: boolean;
};

/** The decisions offered, and why, for the step's meta. */
export type AutomationStudioLlmLoopDecisionOptions = {
  offered: readonly AutomationStudioLlmLoopDecisionKind[];
  /** Why `ask_person` is offered or not, in Core's words. */
  askPerson: "offered" | "after_change_approach" | "after_repeat_persists";
  approachesChanged: number;
};

export function automationStudioLlmLoopDecisionOptions(facts: AutomationStudioLlmLoopDecisionFacts): AutomationStudioLlmLoopDecisionOptions {
  const askPerson = facts.approachesChanged < 1 ? "after_change_approach" : !facts.persisting ? "after_repeat_persists" : "offered";
  return {
    offered: AUTOMATION_STUDIO_LLM_LOOP_DECISIONS.filter((decision) => decision !== "ask_person" || askPerson === "offered"),
    askPerson,
    approachesChanged: facts.approachesChanged
  };
}
