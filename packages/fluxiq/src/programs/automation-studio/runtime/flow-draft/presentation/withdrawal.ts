import type { DraftWithdrawalFacts } from "../../../../../runtime/flow-authoring/draft/presentation/index.ts";

export function automationStudioFlowDraftWithdrawalInstruction(input: DraftWithdrawalFacts): string {
  if (input.kind === "partner_absent") return "taken out by Core: it pressed back a control a step no longer in the draft pressed, so it changed nothing the Flow needs";
  const before = input.previouslyChosen ? "chosen" : "not chosen";
  const state = `The control was already ${before} before step ${input.first}, the state the Flow needs: an act about it belongs on the step after which the page first showed it chosen, and pressing it again would undo that state.`;
  if (input.kind === "unpaired") return `taken out by Core: it pressed back the control step ${input.partner} pressed, and step ${input.partner} is not in the Flow, so in the Flow it would flip the control the wrong way. ${state} Add it back only if the Flow needs the control the other way.`;
  const why = input.kind === "paired_first"
    ? `step ${input.later} pressed the same control back, so the two together changed nothing.`
    : `it pressed back the control step ${input.first} pressed, so the two together changed nothing.`;
  return `taken out by Core: ${why} ${state} Add both back only if a step between them needs the control the other way.`;
}
