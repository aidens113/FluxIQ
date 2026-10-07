// Whether a claim of an act on a step stands, asked as the claim is made.
//
// **The defect this closes (week report W1, 23 live runs).** A claim the act
// judge rejects (`./act-evidence.ts`, `./standing.ts`) was still answered
// "applied": the model put a1 on the press of "Spain" (`run-mux74k5q-1c3c2127`),
// was told nothing, and learnt only later, from the checklist beside its draft,
// that a1 was not done. Meanwhile the claim stuck to the step, so the build's
// test checked that step as an act with a lasting effect instead of running it
// (`../../flow-draft/verify-only.ts`). Asked when the claim is made -- an
// `amend_draft` naming `act`, or a call run with `add` and `act` -- a claim the
// judge would reject is refused there, with the same sentence the checklist
// would say (`todoSaid`), and never put on the step.
//
// The claim is tried on copies of the steps, never the draft itself: the step
// as kept (a claim is made only as the step joins or stays in the Flow) and
// the act taken off every other step (`../../flow-draft/act-claim.ts`). Only
// an act's own id is judged here; a choice is a setting, judged as before.
//
// Nothing here calls a provider or reads a page; it is the instruction and the draft.
import { automationStudioFlowDraftClaimAct, type AutomationStudioFlowDraftStep } from "../../flow-draft/index.ts";
import { automationStudioInstructedActIsEvidenceFault } from "./act-evidence.ts";
import { automationStudioInstructedActsChecklist } from "./checklist.ts";

type Step = AutomationStudioFlowDraftStep;

/** A claim refused as it is made: the act, what the step did instead and where to name the act, and the step whose words or change show it. */
export type AutomationStudioInstructedActClaimRefusal = { act: string; said: string; instead?: number };

/** An act's own id, `a1`, `a12`; never a choice's (`a1.size`). */
const ACT_ID = /^a[0-9]+$/u;

/**
 * The refusal of claiming `act` on `step`, or nothing when the claim would
 * stand, or when the act judge says nothing about it on that step.
 */
export function automationStudioInstructedActClaimVerdict(input: {
  instructionText?: string | undefined;
  startLocation?: Parameters<typeof automationStudioInstructedActsChecklist>[0]["startLocation"];
  arrival?: Parameters<typeof automationStudioInstructedActsChecklist>[0]["arrival"];
  steps: readonly Step[];
  step: Step;
  act: string;
}): AutomationStudioInstructedActClaimRefusal | undefined {
  const id = input.act.trim().toLowerCase();
  const at = input.steps.indexOf(input.step);
  if (!ACT_ID.test(id) || at < 0) return undefined;
  const copies: Step[] = input.steps.map((each) => ({ ...each, ...(each.acts ? { acts: [...each.acts] } : {}) }));
  const claimed = { ...copies[at]!, disposition: "kept" as const };
  copies[at] = claimed;
  automationStudioFlowDraftClaimAct(copies, claimed, id);
  const item = automationStudioInstructedActsChecklist({
    instructionText: input.instructionText,
    draftSteps: copies,
    startLocation: input.startLocation,
    arrival: input.arrival
  })?.find((each) => each.id === id);
  if (!item || item.done !== undefined || item.step !== claimed.position || item.todo === undefined) return undefined;
  if (!automationStudioInstructedActIsEvidenceFault(item.todo) || item.todoSaid === undefined) return undefined;
  return { act: id, said: item.todoSaid, ...(item.instead !== undefined ? { instead: item.instead } : {}) };
}
