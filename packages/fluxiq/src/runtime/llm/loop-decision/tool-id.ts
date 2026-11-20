// The model's own answer to a caught loop (user, 2026-11-19: "we should prompt the model saying its
// repeating and have the model itself decide what to do. It should output a decision such as ask for
// user prompt, continue, etc."). When the loop detector fires, the next decision is asked for one of
// these, by name, and the loop carries it out (`../decision-handlers/loop-decision.ts`).

/** The tool the decision is made with. */
export const AUTOMATION_STUDIO_LLM_LOOP_DECISION_TOOL_ID = "core.loop_decision";

/**
 * The fixed set, each with what it must carry:
 * - `continue`: the repeat is deliberate (`why`, such as waiting for something to change);
 * - `change_approach`: a different way (`approach`, named);
 * - `ask_person`: one plain question to the person (`question`);
 * - `escalate_model`: hand the attempt to the next, stronger model;
 * - `finish_with_best`: answer with what it has (`result`), checked as the attempt's result.
 */
export const AUTOMATION_STUDIO_LLM_LOOP_DECISIONS = Object.freeze(["continue", "change_approach", "ask_person", "escalate_model", "finish_with_best"] as const);

export type AutomationStudioLlmLoopDecisionKind = (typeof AUTOMATION_STUDIO_LLM_LOOP_DECISIONS)[number];
