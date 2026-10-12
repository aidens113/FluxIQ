// Advisory evidence, not an act-coverage rule. Run musuq910 claimed adding to
// cart on a Spain choice and spent repairs configuring rather than adding.
// Control words may be incomplete or domain-specific: preserve the claim and
// let the whole-Flow test and judge decide what the action actually achieved.
// On its own the doubt changes nothing. Beside one more fact it does: a
// doubted step after which a step named for one of the act's own choices acted
// at a different place only opened the page of those choices, and does not do
// the act (`./standing.ts`, `step_only_opens_its_choices`, run mux6pndp). So
// does a record showing the step did something else -- chose one of the act's
// options, cleared a layer, went to another page (`./act-evidence.ts`, W1);
// the checklist then says that verdict in place of this doubt.
//
// **Which words, and done words (r4b F3).** The control is read by the
// identity the step was saved with first, then by the newest call's words for
// it. A control reading one of the act kind's done words ("Collected" for a
// claim) is evidence the act was done, never a doubt: R4b's judge read
// "Collected" as an unrelated control because it does not name "collect" as a
// whole word, and the repair loop went round with nothing to fix.
import { automationStudioFlowDraftStepMovedTarget, type AutomationStudioFlowDraftStep } from "../../flow-draft/index.ts";
import type { AutomationStudioInstructedAct } from "./contracts.ts";
import { automationStudioModelFacingControlWords } from "../../llm/model-facing/index.ts";
import { automationStudioInstructedActWordsNameAct, automationStudioInstructedActWordsShowDone } from "./kind-words.ts";

/** A possible mismatch between an act claim and its known control; executes nothing, and alone never changes done/todo (see the header). */
export function automationStudioInstructedActClaimDoubt(act: AutomationStudioInstructedAct, step: AutomationStudioFlowDraftStep, steps: readonly AutomationStudioFlowDraftStep[]): string | undefined {
  // Set/open controls often name only the chosen value or destination.
  if (act.kind === "set" || act.kind === "open") return undefined;
  const words = automationStudioInstructedActControlWords(step);
  const control = words[0];
  if (!control || words.some((each) => automationStudioInstructedActWordsNameAct(act, each))) return undefined;
  // A control that reads the act done ("Collected") is evidence of the act, not doubt of it (r4b F3).
  if (automationStudioInstructedActControlShowsDone(act, step)) return undefined;
  const next = steps.find((candidate) => candidate.position > step.position && candidate.replay?.from !== undefined);
  const moved = automationStudioFlowDraftStepMovedTarget(step, next);
  return `${act.id} is claimed by step ${step.position}, whose control is ${JSON.stringify(control)}${moved ? " and which led to a different place" : ""}. `
    + `Those words do not name "${act.verb}" or its act kind, so the claim may describe a choice or preparation rather than the requested act. `
    + `The claim is kept. Review the control and what the step actually does; if the requested act needs a different control, author a distinct step for that act and name it there. `
    + `A checked rerun only verifies its target without repeating a lasting effect; it does not add a distinct action. The whole-Flow test and its judge decide.`;
}

/**
 * Whether the step's control reads the act done -- one of its kind's done
 * words (`AUTOMATION_STUDIO_INSTRUCTED_ACT_DONE_WORDS`): "Collected" on the
 * control a claim pressed. The act is then read as present on the page, not as
 * a press of an unrelated control (r4b F3).
 */
export function automationStudioInstructedActControlShowsDone(act: AutomationStudioInstructedAct, step: AutomationStudioFlowDraftStep): boolean {
  return automationStudioInstructedActControlWords(step).some((each) => automationStudioInstructedActWordsShowDone(act.kind, each));
}

/**
 * The words a step's control is read by, most trusted first: the identity the
 * step was saved with (`ranWith`, the resolved form a Flow is written from),
 * when it carries words; then the call's own words for the control and the
 * recorded control, which describe the page as the newest call saw it -- after
 * the act, when the act relabelled its control (r4b: "Get coupons" became
 * "Collected"). Blank words are no words.
 */
function automationStudioInstructedActControlWords(step: AutomationStudioFlowDraftStep): string[] {
  const saved = automationStudioModelFacingControlWords(step.ranWith);
  return [saved, step.words?.target?.trim(), step.control?.trim()].filter((words): words is string => typeof words === "string" && words !== "");
}
