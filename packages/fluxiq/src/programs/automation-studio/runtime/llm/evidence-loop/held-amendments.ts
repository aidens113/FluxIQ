// The amendments a decision makes about the step it also reruns, which wait for
// the rerun.
//
// A `rerun` is carried out by the loop after the decision's other amendments
// are applied (`../decision-handlers/amendment.ts`). An amendment naming the
// same step is about the step that will replace it -- "do step 4 again, and
// step 4 does a1" -- and applied first, it was judged on the step being
// replaced. Live run `run-mup2i28c-6c7fc209`, decision 5, sent `4 rerun` beside
// `4 add act a1`; step 4 was a refused press, so the add was refused
// `did_not_work` and a rerun's success could never carry its act in the same
// decision.
//
// So an amendment naming the rerun's step is held, and once the rerun has run
// it is applied to the step that replaced it -- or, when the rerun did not
// work, refused `did_not_work`, which is what the rerun was. Every other
// amendment of the decision is applied first, as before. A held amendment's
// other step numbers (`to`, `check`, `through`, `over`) were written in the
// numbering the model read, which the rerun's taking its step's place shifts
// (`./rerun-replacement.ts`), so each is read as the step it named then.
//
// A held move can also take off a repeat on another step
// (`repeat_taken_off`, `../../flow-draft/amendment/repeat-revalidation.ts`).
// That refusal is about the step whose repeat went, not the held amendment's,
// so it keeps its own step and is told, like every other number of the
// decision, in the numbering the model wrote: the rerun as the step it
// replaced, and `now`, `overNow` and `throughNow` where the decision changed
// a number.
import {
  applyAutomationStudioFlowDraftAmendments,
  automationStudioFlowDraftStepIsProposable,
  type AutomationStudioFlowDraftAmendment,
  type AutomationStudioFlowDraftAmendmentRefusal,
  type AutomationStudioFlowDraftStep
} from "../../flow-draft/index.ts";

/** A decision's amendments, split into those applied now and those that wait for its rerun. */
export type AutomationStudioLlmEvidenceHeldAmendments = {
  /** Applied before the rerun runs, in the order written. */
  now: AutomationStudioFlowDraftAmendment[];
  /** Naming the rerun's step: applied, or refused, once it has run. */
  held: AutomationStudioFlowDraftAmendment[];
  /**
   * What became of the held amendments, given the step the rerun appended, or
   * nothing when it never ran. Refusals name the step number the model wrote.
   */
  settle(steps: AutomationStudioFlowDraftStep[], rerun: AutomationStudioFlowDraftStep | undefined): { applied: number; refused: AutomationStudioFlowDraftAmendmentRefusal[] };
};

/**
 * Split one decision's non-rerun amendments around the rerun it carries out at
 * `rerunStep` (none, and every amendment is applied now). `steps` is the draft
 * as the model read it, before anything of the decision is applied.
 */
export function automationStudioLlmEvidenceHeldAmendments(
  amendments: readonly AutomationStudioFlowDraftAmendment[],
  steps: readonly AutomationStudioFlowDraftStep[],
  rerunStep: number | undefined
): AutomationStudioLlmEvidenceHeldAmendments {
  const edits = amendments.filter((amendment) => amendment.change !== "rerun");
  const held = rerunStep === undefined ? [] : edits.filter((amendment) => amendment.step === rerunStep);
  const now = edits.filter((amendment) => !held.includes(amendment));
  const named = new Map(steps.map((step) => [step.position, step] as const));
  const wrote = new Map(steps.map((step) => [step, step.position] as const));
  const replaced = rerunStep === undefined ? undefined : named.get(rerunStep);
  return {
    now,
    held,
    settle(draft, rerun) {
      if (!rerun || !replaced || !automationStudioFlowDraftStepIsProposable(rerun)) {
        return { applied: 0, refused: held.map((amendment) => ({ step: amendment.step, reason: "did_not_work" as const })) };
      }
      // The step a number named when the model wrote it, where it stands now.
      const at = (position: number): number => {
        const step = named.get(position);
        return step === replaced ? rerun.position : step && draft.includes(step) ? step.position : position;
      };
      // The number the model wrote for a step, which for the rerun is its replaced step's.
      const written = (step: AutomationStudioFlowDraftStep): number => wrote.get(step === rerun ? replaced : step) ?? step.position;
      let applied = 0;
      const refused: AutomationStudioFlowDraftAmendmentRefusal[] = [];
      for (const amendment of held) {
        const shown = new Map<number, AutomationStudioFlowDraftStep>();
        for (const step of draft) if (!shown.has(step.position)) shown.set(step.position, step);
        const moved: AutomationStudioFlowDraftAmendment = { ...amendment, step: rerun.position };
        for (const key of ["to", "check", "through", "over"] as const) {
          const position = amendment[key];
          if (position !== undefined) moved[key] = at(position);
        }
        const result = applyAutomationStudioFlowDraftAmendments(draft, [moved]);
        applied += result.applied;
        refused.push(...result.refused.map((refusal) => refusal.reason === "repeat_taken_off" ? takenOffAsWritten(refusal, shown, written) : { ...refusal, step: amendment.step }));
      }
      return { applied, refused };
    }
  };
}

/**
 * A `repeat_taken_off` from a held amendment, renumbered from the draft the
 * amendment was applied to into the numbers the model wrote, with `now`,
 * `overNow` and `throughNow` where the step stands elsewhere after it.
 */
function takenOffAsWritten(
  refusal: AutomationStudioFlowDraftAmendmentRefusal,
  shown: ReadonlyMap<number, AutomationStudioFlowDraftStep>,
  written: (step: AutomationStudioFlowDraftStep) => number
): AutomationStudioFlowDraftAmendmentRefusal {
  const read = (position: number | undefined): { was: number; now: number } | undefined => {
    const step = position === undefined ? undefined : shown.get(position);
    return step ? { was: written(step), now: step.position } : position === undefined ? undefined : { was: position, now: position };
  };
  const step = read(refusal.step)!;
  const over = read(refusal.over);
  const through = read(refusal.through);
  const told: AutomationStudioFlowDraftAmendmentRefusal = { ...refusal, step: step.was };
  delete told.now;
  delete told.overNow;
  delete told.throughNow;
  if (over) told.over = over.was;
  if (through) told.through = through.was;
  if (step.now !== step.was) told.now = step.now;
  if (over && over.now !== over.was) told.overNow = over.now;
  if (through && through.now !== through.was) told.throughNow = through.now;
  return told;
}
