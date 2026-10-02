// Why one step named for an act does not do it, as far as the draft can say.
//
// The one rule every reading of the acts applies to a single step: the
// completion check (`./check.ts`) and the checklist (`./checklist.ts`) both
// reach it through the one loop that tries every step named for an act
// (`./standing.ts`). A choice of an item is held to it as an act of setting.
//
// Two rules are not here, because a step and its own act cannot answer them:
// whether the step acted on this act's object rather than another act's needs
// every act (`./object-binding.ts`), and whether presses of an add are the
// quantity asked for needs the act's own step (`./quantity-fault.ts`). The one
// loop applies both after this one.
import type { AutomationStudioFlowDraftStep } from "../../flow-draft/index.ts";
import { automationStudioFlowDraftStepIsProposable, automationStudioFlowDraftStepIsProposed } from "../../flow-draft/index.ts";
import { automationStudioDraftStepDeclaresConsequence } from "./act-consequence.ts";
import type { AutomationStudioInstructedAct, AutomationStudioInstructedActMissing } from "./contracts.ts";
import { automationStudioInstructedActRepeatSpans, automationStudioInstructedActSpanStopsShort } from "./span.ts";

/**
 * Why this step does not do this act, or nothing when it does as far as the
 * draft can say: in the Flow, an action that changed something, not only the
 * arrival at the start (unless the act is one of opening), not optional,
 * repeated through its last step when over a whole set, and declaring the
 * class its verb names (`claimed`: whether a step is named for any act).
 */
export function automationStudioInstructedActStepFault(
  act: AutomationStudioInstructedAct,
  step: AutomationStudioFlowDraftStep,
  steps: readonly AutomationStudioFlowDraftStep[],
  onlyArrives: (step: AutomationStudioFlowDraftStep) => boolean,
  claimed: (step: AutomationStudioFlowDraftStep) => boolean
): Exclude<AutomationStudioInstructedActMissing["reason"], "no_step_named" | "no_such_step" | "step_claimed_twice" | "choice_is_the_act_step" | "step_acts_on_another_object" | "quantity_is_a_repeat" | "quantity_presses_differ"> | undefined {
  const refused = whyNot(step, act.kind !== "open" && onlyArrives(step));
  if (refused) return refused;
  const spans = automationStudioInstructedActRepeatSpans(step, steps);
  if (act.plural && !spans.length) return "act_needs_repeat";
  if (act.plural && automationStudioInstructedActSpanStopsShort(step, steps, claimed)) return "span_stops_short";
  return automationStudioInstructedActConsequenceUndeclared(act, step, steps) ? "act_consequence_undeclared" : undefined;
}

/**
 * Whether the act's verb names a class a person is asked about and neither
 * this step nor any proposed step of a span that repeats it declares that
 * class. The one rule a completion is still refused for
 * (`./permission.ts`): without the declaration nobody is asked.
 */
export function automationStudioInstructedActConsequenceUndeclared(
  act: AutomationStudioInstructedAct,
  step: AutomationStudioFlowDraftStep,
  steps: readonly AutomationStudioFlowDraftStep[]
): boolean {
  const consequence = act.consequence;
  if (!consequence) return false;
  const spans = automationStudioInstructedActRepeatSpans(step, steps);
  // The steps that do the act: its own, or every proposed step of a span that repeats it.
  const doing = spans.length
    ? steps.filter((each) => automationStudioFlowDraftStepIsProposed(each) && spans.some((span) => each.position >= span.from && each.position <= span.to))
    : [step];
  return !doing.some((each) => automationStudioDraftStepDeclaresConsequence(each, consequence));
}

/**
 * Why a named step cannot answer anything, whatever it is named for: it was
 * dropped, changed nothing (a read, or a press that failed), only arrived
 * (`arrives`, which the caller decides, since arriving is an act of opening),
 * or may be skipped. Undefined when it can.
 */
function whyNot(step: AutomationStudioFlowDraftStep, arrives: boolean): "step_not_kept" | "step_changed_nothing" | "step_only_arrives" | "step_is_optional" | undefined {
  if (step.disposition !== "kept") return "step_not_kept";
  if (step.effect !== "mutate" || !automationStudioFlowDraftStepIsProposable(step)) return "step_changed_nothing";
  if (arrives) return "step_only_arrives";
  if (step.routing?.kind === "optional") return "step_is_optional";
  return undefined;
}
