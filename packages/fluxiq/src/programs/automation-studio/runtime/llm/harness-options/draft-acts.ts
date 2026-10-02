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
//
// **A read that misses a column the instruction names is said here too.** The
// build declares the instruction's named columns as an extraction's schema, and
// a named column no field reads was a warning on the plan that nobody saw
// (F35, `flow-bootstrap/authoring/instruction-record-columns.ts`). The draft
// entry is in front of the model on every decision after its read, and this is
// where Core holds both the instruction and the read's fields, so each such
// read adds one `note` after the acts. A note is information: it has no id, no
// act can be claimed for it, `actsMissing` never counts it, and nothing is
// refused for it.
import type { JsonObject, JsonValue } from "../../../../../core/index.ts";
import type { AutomationStudioNodeRegistry, AutomationStudioNodeRegistryResolution } from "../../../nodes/index.ts";
import type { AutomationStudioFlowDraftStep } from "../../flow-draft/index.ts";
import { automationStudioFlowDraftStepIsProposable } from "../../flow-draft/index.ts";
import {
  automationStudioFlowBootstrapUnreadColumnsSentence,
  automationStudioInstructedActsChecklist,
  automationStudioInstructedActsChecklistValue,
  automationStudioInstructedActsNotDone,
  type AutomationStudioInstructedActChecklistItem
} from "../../flow-bootstrap/index.ts";
import { automationStudioRepeatSuggestion } from "./repeat-suggestion.ts";
import { automationStudioFlowBootstrapDraftStepIsWritable } from "../node-tools/index.ts";

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
    acts: (steps) => {
      const value = automationStudioInstructedActsChecklistValue(checklist(steps)?.map((item) => withRepeat(item, steps, input.registry, input.resolution)));
      const notes = unreadColumnNotes(input.instructionText, steps);
      return notes.length ? [...(value ?? []), ...notes] : value;
    },
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

/** One note per read of the draft whose fields miss a column the instruction names. */
function unreadColumnNotes(instructionText: string | undefined, steps: readonly AutomationStudioFlowDraftStep[]): JsonObject[] {
  if (!instructionText) return [];
  return steps.flatMap((step) => {
    // A read the model withdrew, or one that failed, is no longer its read.
    if (step.disposition === "dropped" || step.disposition === "exploratory") return [];
    if (!automationStudioFlowBootstrapDraftStepIsWritable(step) || !automationStudioFlowDraftStepIsProposable(step)) return [];
    const note = automationStudioFlowBootstrapUnreadColumnsSentence({ instructionText, fieldKeys: readFieldKeys(step.input.parameters), reader: `step ${step.position}` });
    return note ? [{ note }] : [];
  });
}

/**
 * The field keys a run-node step's parameters read, where the normaliser finds
 * them (`flow-bootstrap/authoring/normalise.ts`, `columnNames`): `fields` or
 * `columns` on a parameter's object, or on the parameters themselves.
 */
function readFieldKeys(parameters: JsonValue | undefined): string[] {
  if (!isObject(parameters)) return [];
  for (const value of [...Object.values(parameters), parameters]) {
    if (!isObject(value)) continue;
    const fields = value.fields ?? value.columns;
    if (isObject(fields)) return Object.keys(fields);
    if (Array.isArray(fields)) return fields.filter((item): item is string => typeof item === "string");
  }
  return [];
}

function isObject(value: JsonValue | undefined): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
