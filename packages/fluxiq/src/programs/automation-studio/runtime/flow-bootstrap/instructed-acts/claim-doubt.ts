// Advisory evidence, not an act-coverage rule. Run musuq910 claimed adding to
// cart on a Spain choice and spent repairs configuring rather than adding.
// Control words may be incomplete or domain-specific: preserve the claim and
// let the whole-Flow test and judge decide what the action actually achieved.
// On its own the doubt changes nothing. Beside one more fact it does: a
// doubted step after which a step named for one of the act's own choices acted
// at a different place only opened the page of those choices, and does not do
// the act (`./standing.ts`, `step_only_opens_its_choices`, run mux6pndp).
import { automationStudioFlowDraftStepMovedTarget, type AutomationStudioFlowDraftStep } from "../../flow-draft/index.ts";
import type { AutomationStudioInstructedAct } from "./contracts.ts";
import { AUTOMATION_STUDIO_INSTRUCTED_ACT_KIND_WORDS } from "./kind-words.ts";

/** A possible mismatch between an act claim and its known control; executes nothing, and alone never changes done/todo (see the header). */
export function automationStudioInstructedActClaimDoubt(act: AutomationStudioInstructedAct, step: AutomationStudioFlowDraftStep, steps: readonly AutomationStudioFlowDraftStep[]): string | undefined {
  // Set/open controls often name only the chosen value or destination.
  if (act.kind === "set" || act.kind === "open") return undefined;
  const control = step.words?.target?.trim() || step.control?.trim();
  if (!control || [act.verb, ...AUTOMATION_STUDIO_INSTRUCTED_ACT_KIND_WORDS[act.kind]].some((word) => namesWord(control, word))) return undefined;
  const next = steps.find((candidate) => candidate.position > step.position && candidate.replay?.from !== undefined);
  const moved = automationStudioFlowDraftStepMovedTarget(step, next);
  return `${act.id} is claimed by step ${step.position}, whose control is ${JSON.stringify(control)}${moved ? " and which led to a different place" : ""}. `
    + `Those words do not name "${act.verb}" or its act kind, so the claim may describe a choice or preparation rather than the requested act. `
    + `The claim is kept. Review the control and what the step actually does; if the requested act needs a different control, author a distinct step for that act and name it there. `
    + `A checked rerun only verifies its target without repeating a lasting effect; it does not add a distinct action. The whole-Flow test and its judge decide.`;
}

function namesWord(text: string, word: string): boolean {
  const escaped = word.trim().toLowerCase().replace(/[.*+?^${}()|[\]\\]/gu, "\\$&").replace(/\s+/gu, "\\s+");
  return escaped !== "" && new RegExp(`(?<![a-z])${escaped}(?![a-z])`, "iu").test(text);
}
