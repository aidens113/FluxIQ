// Whether a step the saved Flow does not hold has its act done by a step it does (t869). A step is
// left out only when no step of the saved Flow does that act: one that replaced it (a rerun), stands
// for the same carried step, names the same act, presses the same control, or runs the same node with
// the same parameters (Core's own `ensureState` aside, as a stamped step carries it) still does it.

import { automationStudioFlowDraftStepIsProposed, type AutomationStudioFlowDraftStep } from "../../../../../runtime/flow-authoring/draft/index.ts";

const ENSURE_STATE = "ensureState";

/** The step's own name, and what it stood for: every id a replacing or re-added step may carry. */
function namesOf(step: AutomationStudioFlowDraftStep): string[] {
  return [step.id, step.standsFor].filter((name): name is string => name !== undefined && name.length > 0);
}

/** A control or target as words compare: case and spacing folded. */
function wordsOf(step: AutomationStudioFlowDraftStep): string {
  return (step.words?.target ?? step.control ?? "").replace(/\s+/gu, " ").trim().toLowerCase();
}

/** The node and its parameters, `ensureState` taken off; nothing where the step has no node. */
function nodeOf(step: AutomationStudioFlowDraftStep): string | undefined {
  const input = step.input as { node?: unknown; parameters?: unknown };
  if (typeof input.node !== "string") return undefined;
  const parameters = input.parameters && typeof input.parameters === "object" && !Array.isArray(input.parameters) ? { ...(input.parameters as Record<string, unknown>) } : {};
  delete parameters[ENSURE_STATE];
  return JSON.stringify([input.node, parameters, step.actionId]);
}

/** True when a step of `saved` (the proposed ones) does what `out` did. */
export function automationStudioAnswerFirstStepStillDone(out: AutomationStudioFlowDraftStep, saved: readonly AutomationStudioFlowDraftStep[]): boolean {
  const names = new Set(namesOf(out));
  if (out.replacedBy !== undefined) names.add(out.replacedBy);
  const acts = new Set(out.acts ?? []);
  const words = wordsOf(out);
  const node = nodeOf(out);
  return saved.some((step) => {
    if (step === out || !automationStudioFlowDraftStepIsProposed(step)) return false;
    if (namesOf(step).some((name) => names.has(name)) || (step.standsFor !== undefined && names.has(step.standsFor))) return true;
    if (step.acts?.some((act) => acts.has(act)) === true) return true;
    if (words.length > 0 && words === wordsOf(step) && step.actionId === out.actionId) return true;
    return node !== undefined && node === nodeOf(step);
  });
}
