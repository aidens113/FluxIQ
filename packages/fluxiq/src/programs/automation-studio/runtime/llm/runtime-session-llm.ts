// A run a person asked the model to take part in: who asked, and what for.
//
// The intent says what the run is for -- judge its result (`verify_result`),
// diagnose it, or explore and adapt it -- not whether it may spend. Every
// intent runs the same loop under the same bounds: the run's cost, token and
// deadline budgets and the Flow's configured cost ceiling. A lasting
// consequence of an action is still asked about act by act.

import type { AutomationStudioRuntimeAdaptationContext } from "../service.ts";
import type { AutomationStudioLlmModelCaller } from "./model-caller.ts";

/** Every intent a runtime session may be started with. */
export const AUTOMATION_STUDIO_RUNTIME_SESSION_LLM_INTENTS = ["diagnosis_only", "diagnose_and_adapt", "explore_and_adapt", "build_and_adapt", "verify_result"] as const;

export type AutomationStudioRuntimeSessionLlmIntent = (typeof AUTOMATION_STUDIO_RUNTIME_SESSION_LLM_INTENTS)[number];

/** A run a person asked the model to take part in. */
export type AutomationStudioRuntimeSessionLlm = AutomationStudioLlmModelCaller & {
  intent: AutomationStudioRuntimeSessionLlmIntent;
};

/** The adaptation context a run the person asked the model into executes under.
 *
 * A person asked, so the run invokes the model and records what it finds
 * whatever the training mode would have decided. */
export function automationStudioRuntimeAdaptationContextForLlmRun(
  context: AutomationStudioRuntimeAdaptationContext,
  intent: AutomationStudioRuntimeSessionLlmIntent
): AutomationStudioRuntimeAdaptationContext {
  return {
    ...context,
    behavior: { ...context.behavior, invokeLlm: true, createAdaptations: true, promoteAdaptations: true },
    diagnostics: [...context.diagnostics, `Explicit ${intent} run iterates under the configured cost, token and deadline budgets.`]
  };
}
