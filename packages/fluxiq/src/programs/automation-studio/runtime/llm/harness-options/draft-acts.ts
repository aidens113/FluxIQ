// What a Flow Bootstrap's loop shows beside the draft about the instruction's
// acts, and what it names as still owed when the build stops making progress.
//
// The acts were read only inside the completion check, so the model met them
// first in a refusal (audit A1, cause 1). This hands the loop the same reading
// as its `draft.acts` and `draft.actsMissing` (`../loop-configuration.ts`),
// computed from the draft each time it is shown
// (`../../flow-bootstrap/instructed-acts/checklist.ts`). It is information: the
// completion is refused only for an undeclared consequence
// (`./bootstrap-completion.ts`), and the test and its judge decide the rest.
//
// **The repeat an act needs, worked out (t195).** The completion check used to
// hand an act refused `act_needs_repeat` or `span_stops_short` the one
// amendment that repeats it (`./repeat-suggestion.ts`); now that it refuses
// neither, the checklist carries that amendment on the act as `repeatWith`,
// with `repeatSaid` saying what it does, whenever the caller gives the node
// library the suggestion reads listings from. Shown, never applied.
import type { JsonValue } from "../../../../../core/index.ts";
import type { AutomationStudioNodeRegistry, AutomationStudioNodeRegistryResolution } from "../../../nodes/index.ts";
import type { AutomationStudioFlowDraftStep } from "../../flow-draft/index.ts";
import {
  automationStudioInstructedActsChecklist,
  automationStudioInstructedActsChecklistValue,
  automationStudioInstructedActsNotDone,
  type AutomationStudioInstructedActChecklistItem
} from "../../flow-bootstrap/index.ts";
import { automationStudioRepeatSuggestion } from "./repeat-suggestion.ts";

/** The loop's two act callbacks for one build's instruction and start location. */
export function automationStudioFlowBootstrapDraftActs(input: {
  instructionText?: string | undefined;
  startLocation?: string | undefined;
  /** The node library, so an act that needs a repeat is shown the amendment that gives it one. Absent, none is shown. */
  registry?: AutomationStudioNodeRegistry | undefined;
  resolution?: AutomationStudioNodeRegistryResolution | undefined;
}): {
  acts(steps: readonly AutomationStudioFlowDraftStep[]): JsonValue | undefined;
  actsMissing(steps: readonly AutomationStudioFlowDraftStep[]): readonly string[];
} {
  const checklist = (steps: readonly AutomationStudioFlowDraftStep[]) =>
    automationStudioInstructedActsChecklist({ instructionText: input.instructionText, draftSteps: steps, startLocation: input.startLocation });
  return {
    acts: (steps) => automationStudioInstructedActsChecklistValue(checklist(steps)?.map((item) => withRepeat(item, steps, input.registry, input.resolution))),
    actsMissing: (steps) => automationStudioInstructedActsNotDone(checklist(steps))
  };
}

/** The act with the repeat amendment its todo asks for, when the draft gives one. */
function withRepeat(
  item: AutomationStudioInstructedActChecklistItem,
  steps: readonly AutomationStudioFlowDraftStep[],
  registry: AutomationStudioNodeRegistry | undefined,
  resolution: AutomationStudioNodeRegistryResolution | undefined
): AutomationStudioInstructedActChecklistItem {
  if (!registry || !resolution || item.step === undefined || (item.todo !== "act_needs_repeat" && item.todo !== "span_stops_short")) return item;
  const missing = { id: item.id, reason: item.todo, step: `${item.step}`, ...(item.after !== undefined ? { after: item.after } : {}) };
  const suggestion = automationStudioRepeatSuggestion({ missingActs: { acts: [missing] }, draftSteps: steps, registry, resolution });
  return suggestion ? { ...item, repeatWith: suggestion.amendment, repeatSaid: suggestion.instruction.trim() } : item;
}
