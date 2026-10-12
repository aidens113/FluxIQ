// What a step carried from an earlier Flow is, for every reader of a draft.
//
// A re-author or an extend seeds its draft from a stored Flow
// (`../../llm/node-tools/draft-from-flow.ts`), naming each node it carries
// `f<n>`, clear of the `d<n>` the loop mints for a step it runs. Three readers
// ask about those steps -- the test's gate (`../../llm/node-tools/dry-run-gate.ts`),
// the replay (`../../llm/node-tools/replay-draft.ts`) and the judgement of a
// round that stopped (`../../flow-bootstrap/unfinished-build/not-run.ts`) -- and
// they used to ask three different questions. Here, in the draft's own
// directory, which all three import without a cycle, they ask one.
//
// **An unchanged carried step is run as the Flow saved it (t274-c4).** Live run
// `run-muw60j7c-bb7c9a62` (re-author steps 0041-0136): the seed held a navigate,
// an optional "Decline" press joined at a Merge, a "Not now" press, a type and
// two reads. The gate could already run an unchanged carried step fresh from its
// scheduled candidate (`../scheduled-candidate/`: the saved configuration and
// where the refuted run captured its node starting), but the judgement still
// listed steps 1-5 as `not_run_in_this_build`, and the brief and every round's
// instruction ordered each rerun live. The domain refuses a live run of an
// element-acting node whose parameters name no handle (`target_not_a_handle`),
// and a carried press keeps its stored element and no handle, so every rerun of
// the type step was refused for five rounds until the budget ran out. A step
// the test will run as its candidate has not run in this build, but nothing
// needs to be done to it before the test: it is not `not_run_in_this_build`.
//
// **A carried routing join passes through.** The seed keeps the Merge an
// optional step joins at as the step after it, so assembly joins there rather
// than adding a second (`../../flow-bootstrap/authoring/draft-routing.ts`). It
// acts on nothing, declares nothing, has no start page and no output action, so
// it never had a candidate: the gate refused it, the replay sent nothing for it
// and failed it ("a step with nothing to run it with"), and the judgement listed
// it for a rerun the domain cannot do. It is a place two ways meet, not a step to
// run, and the Flow still holds it.
//
// **An optional carried step the test cannot run is passed over, never
// rerun live (t439).** A step the Flow runs only when its trigger shows -- the
// notice it closes, the banner it answers -- is skipped by playback when the
// trigger is absent, and the test excuses it the same way
// (`../routing.ts`, `../excused.ts`). Live run `run-mv4912r9-53b05a51` listed
// such a step for a live rerun while no notice stood on the page, and the
// model, made to run it, pressed an unrelated account control (t870) to have
// something to press. An unchanged one is scheduled like any other saved step
// (`../scheduled-candidate/`); one the test cannot run as saved is sent with
// nothing, fails, and is excused as the optional step it is.

import { automationStudioFlowDraftScheduledCandidateCall } from "../scheduled-candidate/index.ts";
import type { AutomationStudioFlowDraftStep } from "../step.ts";

/** The seed's own name for a step it carries: `f` and a number from 1. */
const CARRIED_STEP_ID = /^f[1-9][0-9]*$/u;

/** The join a Flow's optional step leads both of its ways into. */
const MERGE_NODE_ID = "builtin.control.merge";

/**
 * Whether a draft step was carried from an earlier Flow (seeded as `f<n>`)
 * rather than run in this build: a re-authored Flow is judged on its own test,
 * never on what the earlier Flow's steps claimed (`result-verification/build-test/`).
 */
export function automationStudioFlowDraftStepCarried(step: { id?: string | undefined }): boolean {
  return typeof step.id === "string" && CARRIED_STEP_ID.test(step.id);
}

/** Whether a step is a carried routing join: a Merge the seed kept, which the test passes through and never sends. */
export function automationStudioFlowDraftStepCarriedJoin(step: { id?: string | undefined; actionId: string }): boolean {
  return step.actionId === MERGE_NODE_ID && automationStudioFlowDraftStepCarried(step);
}

/**
 * Whether a step is carried, the Flow runs it only when its trigger shows
 * (`optional`, or the answer to an interruption), and the test cannot run it as
 * saved: it is passed over as playback passes it, and never listed for a live
 * rerun (header).
 */
export function automationStudioFlowDraftStepCarriedPassedOver(step: AutomationStudioFlowDraftStep): boolean {
  if (!automationStudioFlowDraftStepCarried(step) || automationStudioFlowDraftStepCarriedJoin(step)) return false;
  if (step.routing?.kind !== "optional" && step.interruption !== true) return false;
  return !runnable(step);
}

/**
 * Whether a step is carried and the test cannot run it as the Flow saved it, so
 * only a live rerun makes it runnable (`not_run_in_this_build`,
 * `../full-run-required.ts`): it has no scheduled candidate -- it was changed
 * since it was seeded -- and was not rerun with what it ran with and where it
 * starts. Never a carried routing join, and never an optional step the test
 * passes over (`automationStudioFlowDraftStepCarriedPassedOver`).
 */
export function automationStudioFlowDraftStepNotRunInThisBuild(step: AutomationStudioFlowDraftStep): boolean {
  if (!automationStudioFlowDraftStepCarried(step) || automationStudioFlowDraftStepCarriedJoin(step)) return false;
  if (automationStudioFlowDraftStepCarriedPassedOver(step)) return false;
  return !runnable(step);
}

/** Whether the test can send a step: as its scheduled candidate, or with what it ran with and where it starts. */
function runnable(step: AutomationStudioFlowDraftStep): boolean {
  return automationStudioFlowDraftScheduledCandidateCall(step) !== undefined || (step.ranWith !== undefined && step.replay !== undefined);
}
