// The one amendment that answers `act_needs_repeat`, worked out for the model.
//
// **Why.** Lane t195's live run `run-muntu7in-e3dd1972` was told to confirm
// every friend request with five or more mutual friends. Its draft held the
// listing of the requests and, right after it, one Confirm; it claimed that
// Confirm for the act eight times, and eight times was refused
// `act_needs_repeat` with a sentence explaining repeat in general. It never
// wrote the amendment. The refusal knew everything the amendment needs -- the
// step it claimed, and the listing before it -- so it now says the amendment
// itself, in the draft's own step numbers.
//
// **What it proposes.** For an act refused `act_needs_repeat`, the nearest
// proposed step before the claimed one whose node puts out a list, and the span
// from the first proposed step after that listing through the claimed step:
// `{ step: <first after the listing>, change: "repeat", over: <listing>,
// through: <claimed> }`. The span, not the claimed step alone, because the act
// is often the last of several done to a row -- the row's Withdraw, then the
// dialog's confirm -- and every one of them has to run on each row. Only a
// suggestion: nothing is changed on the model's behalf,
// because whether the listing keeps only the items to act on is the model's to
// say (a loop over an unfiltered list acts on every row), and the refusal says
// so beside it. No listing before the claimed step, no suggestion.

import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioNodeRegistry, AutomationStudioNodeRegistryResolution } from "../../../nodes/index.ts";
import type { AutomationStudioFlowDraftStep } from "../../flow-draft/index.ts";
import { automationStudioFlowDraftStepIsProposed } from "../../flow-draft/index.ts";

/** The sentence that goes with a suggestion, in the draft's numbers. */
export type AutomationStudioRepeatSuggestion = { amendment: JsonObject; instruction: string };

/** The repeat amendment for the first act refused `act_needs_repeat`, or nothing when the draft has no listing before the claimed step. */
export function automationStudioRepeatSuggestion(input: {
  missingActs: JsonObject;
  draftSteps: readonly AutomationStudioFlowDraftStep[];
  registry: AutomationStudioNodeRegistry;
  resolution: AutomationStudioNodeRegistryResolution;
}): AutomationStudioRepeatSuggestion | undefined {
  const acts = Array.isArray(input.missingActs.acts) ? input.missingActs.acts : [];
  const needing = acts.find((act): act is JsonObject => typeof act === "object" && act !== null && !Array.isArray(act) && act.reason === "act_needs_repeat" && typeof act.step === "string");
  if (!needing) return undefined;
  const proposed = input.draftSteps.filter(automationStudioFlowDraftStepIsProposed);
  const claimed = proposed.find((step) => step.id === needing.step || `${step.position}` === needing.step);
  if (!claimed) return undefined;
  const listing = proposed
    .filter((step) => step.position < claimed.position)
    .reverse()
    .find((step) => listsRows(step, input.registry, input.resolution));
  if (!listing) return undefined;
  const first = proposed.find((step) => step.position > listing.position) ?? claimed;
  const amendment: JsonObject = { step: first.position, change: "repeat", over: listing.position, through: claimed.position };
  const span = first === claimed ? `step ${claimed.position}` : `steps ${first.position} through ${claimed.position}`;
  return {
    amendment,
    instruction: ` repeatWith is the amendment that makes ${span} run once for every row step ${listing.position} lists: send it as amend_draft, then complete again naming step ${claimed.position} for the act.`
      + (first === claimed ? "" : ` Every step of that span runs on each row; drop any of them that does not belong to doing the act to one row.`)
      + ` Every row the listing returns is acted on, so if it lists rows the act must not touch, first rerun step ${listing.position} with a where that keeps only the ones to act on.`
  };
}

/** Whether the step's node puts out a list: the source a span repeats over. */
function listsRows(step: AutomationStudioFlowDraftStep, registry: AutomationStudioNodeRegistry, resolution: AutomationStudioNodeRegistryResolution): boolean {
  return registry.get(step.actionId, resolution)?.outputs.some((port) => port.valueType === "array") === true;
}
