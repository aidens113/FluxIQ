// The instructed acts as the model's own checklist, shown beside the draft from
// the first decision.
//
// **The defect this closes (audit A1, cause 1).** Core read the instruction's
// acts only inside the completion check, so the model first learned what "done"
// meant from a refusal: `bootstrap.instructed_act_missing` refused 304 of 401
// completions in the failed builds of 2026-09-29/30, was the last refusal in 35
// of 57 of them, and every build's first completion was refused
// `no_step_named` because the act ids existed nowhere else. So the same reading
// is shown every decision, as a list of what the person asked for with each
// act's state against the draft as it stands: `done` naming the step of the
// Flow that does it, or `todo` saying why nothing does yet.
//
// **One rule, not two.** An act is done here exactly when the check would
// accept the step the model said does it (`./check.ts`,
// `automationStudioInstructedActStepFault`), so the checklist never shows done
// what a completion then refuses. A step says which act it does when the model
// adds it (`act`), which is also the claim the check reads.
//
// Nothing here calls a provider or reads a page; it is the instruction's words
// and the draft.
import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioFlowDraftStep } from "../../flow-draft/index.ts";
import { automationStudioFlowBootstrapDraftStepGoesToLocation } from "../reachability/index.ts";
import { automationStudioInstructedActStepFault } from "./check.ts";
import { automationStudioInstructedActs } from "./instruction-acts.ts";

/** Why an act on the checklist is not done yet. */
export type AutomationStudioInstructedActTodo =
  /** No step in the Flow says it does this act. */
  | "no_step_added"
  | "step_not_kept"
  | "step_changed_nothing"
  | "step_only_arrives"
  | "step_is_optional"
  | "act_needs_repeat";

/** One act as the model is shown it. */
export type AutomationStudioInstructedActChecklistItem = {
  id: string;
  verb: string;
  /** The person's own words for this act. */
  quote: string;
  plural?: true;
  /** The position of the step of the Flow that does it. */
  done?: number;
  /** Why no step does it yet, when none does. */
  todo?: AutomationStudioInstructedActTodo;
  /** The step that says it does it but does not, when one does. */
  step?: number;
};

/** The checklist, or nothing when the instruction asks for no lasting act. */
export function automationStudioInstructedActsChecklist(input: {
  instructionText?: string | undefined;
  draftSteps: readonly AutomationStudioFlowDraftStep[];
  startLocation?: string | undefined;
}): AutomationStudioInstructedActChecklistItem[] | undefined {
  const acts = automationStudioInstructedActs(input.instructionText ?? "");
  if (!acts.length) return undefined;
  const startLocation = input.startLocation?.trim();
  const onlyArrives = (step: AutomationStudioFlowDraftStep): boolean =>
    startLocation ? automationStudioFlowBootstrapDraftStepGoesToLocation(step, startLocation) : false;
  const used = new Set<AutomationStudioFlowDraftStep>();
  return acts.map((act) => {
    const item: AutomationStudioInstructedActChecklistItem = { id: act.id, verb: act.verb, quote: act.quote, ...(act.plural ? { plural: true as const } : {}) };
    // Every step that says it does this act, in the Flow first.
    const saying = input.draftSteps
      .filter((step) => step.acts?.includes(act.id))
      .sort((left, right) => Number(right.disposition === "kept") - Number(left.disposition === "kept"));
    for (const step of saying) {
      const fault = automationStudioInstructedActStepFault(act, step, input.draftSteps, onlyArrives);
      if (!fault && !used.has(step)) {
        used.add(step);
        return { ...item, done: step.position };
      }
    }
    const first = saying[0];
    const fault = first ? automationStudioInstructedActStepFault(act, first, input.draftSteps, onlyArrives) : undefined;
    return fault && first ? { ...item, todo: fault, step: first.position } : { ...item, todo: "no_step_added" };
  });
}

/** The ids of the acts the checklist shows as not done. */
export function automationStudioInstructedActsNotDone(items: readonly AutomationStudioInstructedActChecklistItem[] | undefined): string[] {
  return (items ?? []).filter((item) => item.done === undefined).map((item) => item.id);
}

/** The checklist as the draft entry carries it: compact, with no field it does not need. */
export function automationStudioInstructedActsChecklistValue(items: readonly AutomationStudioInstructedActChecklistItem[] | undefined): JsonObject[] | undefined {
  return items?.map((item) => ({ ...item }));
}
