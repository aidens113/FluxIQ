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
// **A claim made before the step's place in the Flow is settled (live run
// `run-muxky54f-fadb9d03`, lane D round 4, 0037).** The checklist judges a step
// first by where it stands -- optional, not yet repeated for a plural act, a
// span that stops short, a class undeclared (`./step-fault.ts`) -- and only
// then by what it did (`./standing.ts`). A claim is made before the repeat
// that goes with it: the model sent `14 add act a1` then `14 repeat over 12`
// about a press of "Close chat", a layer over the request list, as Core's own
// answer told it to. The claim read `act_needs_repeat`, was not refused, and
// once the repeat was on the checklist said `step_only_clears_the_way` -- with
// a1 stuck on the step, so the next test checked it as a done act. A repeat or
// a declaration cannot make such a step do the act, so for those todos the
// verdict asks what the step did instead (`./act-evidence.ts`) as the
// checklist would once they are settled, and refuses with the same sentence.
//
// Nothing here calls a provider or reads a page; it is the instruction and the draft.
import { automationStudioFlowDraftClaimAct, type AutomationStudioFlowDraftStep } from "../../flow-draft/index.ts";
import {
  automationStudioInstructedActEvidenceSaid,
  automationStudioInstructedActIsEvidenceFault,
  automationStudioInstructedActStepDidInstead,
  automationStudioInstructedActStepThatNamesIt
} from "./act-evidence.ts";
import { automationStudioInstructedActsChecklist } from "./checklist.ts";
import { automationStudioInstructedActs } from "./instruction-acts.ts";

type Step = AutomationStudioFlowDraftStep;

/** A claim refused as it is made: the act, what the step did instead and where to name the act, and the step whose words or change show it. */
export type AutomationStudioInstructedActClaimRefusal = { act: string; said: string; instead?: number };

/** An act's own id, `a1`, `a12`; never a choice's (`a1.size`). */
const ACT_ID = /^a[0-9]+$/u;

/** The todos the checklist gives a step by where it stands in the Flow, before what it did is read (see the header). */
const NOT_SETTLED: ReadonlySet<string> = new Set(["act_needs_repeat", "span_stops_short", "step_is_optional", "act_consequence_undeclared"]);

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
  if (NOT_SETTLED.has(item.todo)) return didInstead(input.instructionText ?? "", id, claimed, copies);
  if (!automationStudioInstructedActIsEvidenceFault(item.todo) || item.todoSaid === undefined) return undefined;
  return { act: id, said: item.todoSaid, ...(item.instead !== undefined ? { instead: item.instead } : {}) };
}

/**
 * The refusal of a claim whose step's place in the Flow is not settled yet,
 * read from what the step did instead, worded as the checklist words it once
 * it is; nothing when its record shows nothing else (see the header).
 */
function didInstead(instructionText: string, id: string, claimed: Step, steps: readonly Step[]): AutomationStudioInstructedActClaimRefusal | undefined {
  const acts = automationStudioInstructedActs(instructionText);
  const act = acts.find((each) => each.id === id);
  const instead = act ? automationStudioInstructedActStepDidInstead(act, claimed, steps, acts) : undefined;
  if (!act || !instead) return undefined;
  const there = automationStudioInstructedActStepThatNamesIt(act, acts, claimed, steps);
  const said = automationStudioInstructedActEvidenceSaid({ act, fault: instead.fault, step: claimed, chooses: "chooses" in instead ? instead.chooses : undefined, instead: there, steps });
  return { act: id, said, ...(there !== undefined ? { instead: there } : {}) };
}
