import type { AutomationStudioLlmEvidenceRuntimeBinding } from "./index.ts";
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
// where Core holds both the instruction and the reads' fields, so a named
// column no read of the draft gives adds one `note` after the acts. It names no
// step: the read it named was once the filter listing a repeat runs over, and
// the model reworked that listing instead of adding the read the table needed
// (run `run-murdouox-c5294247`, R4). A note is information: it has no id, no
// act can be claimed for it, `actsMissing` never counts it, and nothing is
// refused for it.
//
// **So is a read that comes only before the last act (run
// `run-murwcaj0-40e56557`, R4).** The draft read name and mutualFriends at step
// 7, then confirmed at step 10 and read nothing after, so the note above was
// silent, the build completed, and the judge refuted a table of the page as it
// was before the confirms. When some kept, proposable read gives every named
// column and every such read sits before the last kept step carrying `acts`,
// the same note entry says so instead, naming that act step and never the
// read. Never both: a column no read gives wins.
//
// **A loop that could end only by failing is refused as it is written (run
// `run-mwblz4aq-0baa810a`).** A repeat that runs its span again while the
// span's last step succeeds ends when that step answers ended because there is
// nothing more; a press can answer no such route. Assembly refuses that loop
// (`flow_draft.repeat_while_never_ends`), but under answer-first assembly comes
// after the answer, and the model never saw it: that run capped a press at 20
// passes and spent 19 on nothing. So `loopNeverEnds` asks assembly itself, on
// the draft as the amendment left it, and hands its own sentence -- which names
// this library's nodes that do end a loop -- to the amendment, which is taken
// back and refused `repeat_never_ends` (`../../flow-authoring/draft/amendment/apply.ts`).
// Asking assembly rather than restating its rule is what makes the refusal
// come exactly when the Flow's would: no ending and no `most` the person gave.
import type { JsonObject, JsonValue } from "../../../core/index.ts";
import type { AutomationStudioNodeRegistry, AutomationStudioNodeRegistryResolution } from "../../../framework/automation-service/nodes/index.ts";
import type { AutomationStudioFlowDraftClaimRefused, AutomationStudioFlowDraftLoopNeverEnds, AutomationStudioFlowDraftStep } from "../../flow-authoring/draft/index.ts";
import { automationStudioFlowDraftStepId, automationStudioFlowDraftStepIsProposable, automationStudioFlowDraftStepIsProposed } from "../../flow-authoring/draft/index.ts";
import {
  assembleAutomationStudioFlowDraftPlan,
  automationStudioFlowBootstrapDraftUnreadColumnsSentence,
  automationStudioInstructedActClaimVerdict,
  automationStudioInstructedActsChecklist,
  automationStudioInstructedActsChecklistValue,
  automationStudioInstructedActsNotDone,
  type AutomationStudioInstructedActChecklistItem
} from "../../flow-authoring/bootstrap/index.ts";
import { automationStudioRepeatSuggestion } from "./repeat-suggestion.ts";
import { automationStudioFlowBootstrapDraftRoute } from "./draft-route.ts";
import { automationStudioFlowBootstrapDraftNodeStep, automationStudioFlowBootstrapDraftStepIsWritable } from "../node-tools/index.ts";

/** Assembly's code for a repeat whose last step can answer no route that ends it (`flow-authoring/bootstrap/authoring/draft-routing.ts`). */
const REPEAT_NEVER_ENDS_CODE = "flow_draft.repeat_while_never_ends";

/** The summary the loop check assembles the draft under: assembly needs one, and nothing reads it. */
const LOOP_CHECK_SUMMARY = "The draft as it stands, assembled to check one loop.";

/**
 * The loop's act callbacks for one build's instruction and start location: the
 * checklist, the acts not done, and whether a claim stands as it is made
 * (`claimRefused`, week report W1: a claim the act judge would reject is
 * refused there, with the checklist's own sentence, rather than told later),
 * and whether a loop a repeat writes can end (`loopNeverEnds`, header).
 */
export function automationStudioFlowBootstrapDraftActs(input: {
  instructionText?: string | undefined;
  startLocation?: string | undefined;
  arrival?: NonNullable<AutomationStudioLlmEvidenceRuntimeBinding["runsNodes"]>["arrival"] | undefined;
  /** The node library, so an act that needs a repeat is shown the amendment that gives it one. Absent, none is shown. */
  registry?: AutomationStudioNodeRegistry | undefined;
  resolution?: AutomationStudioNodeRegistryResolution | undefined;
  /** The build's route and the instructions active now, so the draft shows the route and completion holds the Flow to it (`./draft-route.ts`). Absent, neither. */
  route?: Parameters<typeof automationStudioFlowBootstrapDraftRoute>[0]["route"];
  activeInstructions?: Parameters<typeof automationStudioFlowBootstrapDraftRoute>[0]["activeInstructions"];
}): {
  acts(steps: readonly AutomationStudioFlowDraftStep[]): JsonValue | undefined;
  actsMissing(steps: readonly AutomationStudioFlowDraftStep[]): readonly string[];
  claimRefused: AutomationStudioFlowDraftClaimRefused;
  loopNeverEnds: AutomationStudioFlowDraftLoopNeverEnds;
} & ReturnType<typeof automationStudioFlowBootstrapDraftRoute> {
  const checklist = (steps: readonly AutomationStudioFlowDraftStep[]) =>
    automationStudioInstructedActsChecklist({ instructionText: input.instructionText, draftSteps: steps, startLocation: input.startLocation, arrival: input.arrival });
  return {
    acts: (steps) => {
      const value = automationStudioInstructedActsChecklistValue(checklist(steps)?.map((item) => withRepeat(item, steps, input.registry, input.resolution)));
      const notes = unreadColumnNotes(input.instructionText, steps);
      return notes.length ? [...(value ?? []), ...notes] : value;
    },
    actsMissing: (steps) => automationStudioInstructedActsNotDone(checklist(steps)),
    claimRefused: (steps, step, act) => automationStudioInstructedActClaimVerdict({ instructionText: input.instructionText, startLocation: input.startLocation, arrival: input.arrival, steps, step, act }),
    loopNeverEnds: (steps, step) => loopNeverEnds(steps, step, input.registry, input.resolution),
    ...automationStudioFlowBootstrapDraftRoute({ route: input.route, activeInstructions: input.activeInstructions, startLocation: input.startLocation, arrival: input.arrival })
  };
}

/**
 * Assembly's own refusal of the repeat on `step` when its loop could end only
 * by failing, from the draft's steps in the Flow as the completion assembles
 * them (`./bootstrap-completion.ts`, `fromDraft`), or nothing when it can end,
 * when assembly refuses it for another reason first, or with no library to
 * assemble against.
 */
function loopNeverEnds(
  steps: readonly AutomationStudioFlowDraftStep[],
  step: AutomationStudioFlowDraftStep,
  registry: AutomationStudioNodeRegistry | undefined,
  resolution: AutomationStudioNodeRegistryResolution | undefined
): string | undefined {
  if (!registry || !resolution) return undefined;
  const { issues } = assembleAutomationStudioFlowDraftPlan({
    steps: steps.filter(automationStudioFlowDraftStepIsProposed),
    write: automationStudioFlowBootstrapDraftNodeStep,
    registry,
    resolution,
    summary: LOOP_CHECK_SUMMARY
  });
  return issues.find((issue) => issue.code === REPEAT_NEVER_ENDS_CODE && issue.path === `draft.steps.${step.position}`)?.message;
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

/**
 * One note for the draft when no read of it gives a column the instruction
 * names, or else when every read that gives them all runs before the last step
 * that does an instructed act.
 */
function unreadColumnNotes(instructionText: string | undefined, steps: readonly AutomationStudioFlowDraftStep[]): JsonObject[] {
  if (!instructionText) return [];
  const reads = steps.flatMap((step) => {
    // A read the model withdrew, or one that failed, is no longer its read.
    if (!isKept(step)) return [];
    if (!automationStudioFlowBootstrapDraftStepIsWritable(step) || !automationStudioFlowDraftStepIsProposable(step)) return [];
    return [{ step: step.position, fieldKeys: readFieldKeys(step.input.parameters) }];
  });
  const actSteps = steps.filter((step) => isKept(step) && (step.acts?.length ?? 0) > 0).map((step) => step.position);
  const lastActStep = actSteps.length ? Math.max(...actSteps) : undefined;
  const lastActRepeats = lastActStep !== undefined && inRepeatedSpan(steps, lastActStep);
  const note = automationStudioFlowBootstrapDraftUnreadColumnsSentence({ instructionText, reads, lastActStep, lastActRepeats });
  return note ? [{ note }] : [];
}

/**
 * Whether the step at `position` is in a span a kept step repeats: that step
 * itself, or one up to the step its `through` names. Said so the note tells a
 * repeated act that the listing it walks stays before it (R18).
 */
function inRepeatedSpan(steps: readonly AutomationStudioFlowDraftStep[], position: number): boolean {
  return steps.some((step) => {
    if (!isKept(step) || step.routing?.kind !== "repeat") return false;
    const through = step.routing.through;
    const end = steps.find((candidate) => automationStudioFlowDraftStepId(candidate) === through)?.position ?? step.position;
    return step.position <= position && position <= Math.max(end, step.position);
  });
}

function isKept(step: AutomationStudioFlowDraftStep): boolean {
  return step.disposition !== "dropped" && step.disposition !== "exploratory";
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
