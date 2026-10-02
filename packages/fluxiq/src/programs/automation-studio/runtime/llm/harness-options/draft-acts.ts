// What a Flow Bootstrap's loop shows beside the draft about the instruction's
// acts, and what it names as still owed when the build stops making progress.
//
// The acts were read only inside the completion check, so the model met them
// first in a refusal (audit A1, cause 1; `./bootstrap-completion.ts` runs that
// check). This hands the loop the same reading as its `draft.acts` and
// `draft.actsMissing` (`../loop-configuration.ts`), computed from the draft each
// time it is shown (`../../flow-bootstrap/instructed-acts/checklist.ts`).
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
import type { AutomationStudioFlowDraftStep } from "../../flow-draft/index.ts";
import { automationStudioFlowDraftStepIsProposable } from "../../flow-draft/index.ts";
import {
  automationStudioFlowBootstrapUnreadColumnsSentence,
  automationStudioInstructedActsChecklist,
  automationStudioInstructedActsChecklistValue,
  automationStudioInstructedActsNotDone
} from "../../flow-bootstrap/index.ts";
import { automationStudioFlowBootstrapDraftStepIsWritable } from "../node-tools/index.ts";

/** The loop's two act callbacks for one build's instruction and start location. */
export function automationStudioFlowBootstrapDraftActs(input: { instructionText?: string | undefined; startLocation?: string | undefined }): {
  acts(steps: readonly AutomationStudioFlowDraftStep[]): JsonValue | undefined;
  actsMissing(steps: readonly AutomationStudioFlowDraftStep[]): readonly string[];
} {
  const checklist = (steps: readonly AutomationStudioFlowDraftStep[]) =>
    automationStudioInstructedActsChecklist({ instructionText: input.instructionText, draftSteps: steps, startLocation: input.startLocation });
  return {
    acts: (steps) => {
      const value = automationStudioInstructedActsChecklistValue(checklist(steps));
      const notes = unreadColumnNotes(input.instructionText, steps);
      return notes.length ? [...(value ?? []), ...notes] : value;
    },
    actsMissing: (steps) => automationStudioInstructedActsNotDone(checklist(steps))
  };
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
