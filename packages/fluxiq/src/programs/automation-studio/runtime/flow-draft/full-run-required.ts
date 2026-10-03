// What a completion is told when its Flow holds steps the test cannot run, so
// the Flow cannot be run whole.
//
// **The rule (user, 2026-10-02).** A Flow is finished only after a run of the
// whole Flow from its start was judged to do what was asked, on the Flow as it
// finally stands. Three kinds of step stand in the way of that run, and each is
// named here with its own word:
//
//   not_run_in_this_build -- carried from an earlier Flow by a re-author or an
//                            extend (`../llm/node-tools/draft-from-flow.ts`): it
//                            has no argument it ran with, nothing to put the
//                            target back with, and no consequence declaration.
//                            Running it would also bypass the permission gate,
//                            which reads an absent declaration as "no
//                            consequence". Before this refusal such a draft was
//                            simply not tested, the judge answered `unknown`,
//                            the build finished unverified, and the Flow was
//                            approved and applied before anything had run it
//                            whole (`recovery/refuted-result/reauthor.ts`).
//   cannot_run_again      -- a step whose run left nothing to run it again
//                            with, or a first step with nothing to put the
//                            target back where the Flow starts. Until t244 a
//                            draft holding one was "not a draft the gate applies
//                            to" and passed untested.
//   not_a_library_step    -- where the build offers the node library, a step
//                            taken through another tool: the Flow can be written
//                            from its steps only when every step went through
//                            the library (`../llm/node-tools/draft-step.ts`), so
//                            one such step sent the Flow to the plan the reply
//                            wrote out, which never ran -- the test ran one Flow
//                            and the judge's yes was stored on another.
//   not_reached           -- a step the test never came to: a written step
//                            inside a repeat whose list had no rows in the
//                            test, so it ran zero times, or inside a repeat
//                            the test could not walk row by row, where it did
//                            not pass on the row the build explored (design
//                            t252). A written step never ran in the build
//                            either, so nothing has shown it works. In a
//                            repeat the test could not walk, so is a step
//                            bound to the row (`$row`) whose value had no row
//                            to come from: its bound form never ran.
//
// The refusal names those steps and says the one way through: rerun each, in
// the Flow's order, so it becomes a step that ran, with the consequences it
// would have declared; a step of another tool is run again as its library node.
// Since t252 a step may also be written rather than run (`core.run_node` with
// `write: true`), and both tellings say so: writing is how a step whose run
// would do something lasting takes its place without doing it.
// Core's words only; what a step acts on is the domain's. The re-author's
// brief and a repair's resume say the same of carried steps in the same words
// before any completion is refused (`../recovery/refuted-result/brief.ts`,
// `../llm/evidence-loop/resume.ts`, t194-w70).

import type { JsonObject } from "../../../../core/index.ts";

/** The issue a completion refused for steps the test cannot run is counted under. */
export const AUTOMATION_STUDIO_FLOW_DRAFT_FULL_RUN_REQUIRED_CODE = "llm_evidence_loop.full_run_required";

/** Why the test cannot run a step: the word it is shown with, beside a dry run's own words. */
export type AutomationStudioFlowDraftUnrunnableWord = "not_run_in_this_build" | "cannot_run_again" | "not_a_library_step" | "not_reached";

const FULL_RUN_REQUIRED_INSTRUCTION = "The Flow is finished only once it has run whole from its start and been judged to do what was asked. "
  + "These steps cannot be run again as they stand, so the Flow cannot be tested whole until they can. "
  + "not_run_in_this_build: the step came from the Flow being changed and has not run in this build; a rerun of it is first put back where its node started in the run being repaired, where that run recorded it. "
  + "cannot_run_again: its run left nothing to run it again with, or, for the first step, nothing to put the target back where the Flow starts. "
  + "not_a_library_step: it ran through a tool that is not the node library, and a Flow is made only of library nodes that ran: run or write the node that does it with core.run_node (add true, or write true) in its place, and drop this one. "
  + "not_reached: it was written, not run, or it takes a value from the item ($row), and the test never ran it on an item of the list its repeat goes over, for one of two reasons. "
  + "Either that list had no items in the test: run the listing where it returns items, or run this step once yourself. "
  + "Or the test could not go through the list's items, because the listing did not run again cleanly or gave back no items, so it ran the repeat once on the item you explored and this step did not pass there: make the listing run again cleanly (rerun it), or run this step once yourself. "
  + "Rerun each other one, in the Flow's order (amend_draft rerun), adding the consequences it would have to its input ([] when it leaves nothing lasting), so it takes its place as a step that ran; or write it in its place (core.run_node with write true) when running it would do something lasting. "
  + "core.run_flow runs part of the Flow from where the target stands, when the target first has to be brought to where a step starts. "
  + "Then finish again, and the whole Flow is tested.";

const NOTHING_RAN_INSTRUCTION = "The Flow is finished only once it has run whole from its start and been judged to do what was asked, and no step of this Flow has run in this build, so there is nothing the test could run. "
  + "A Flow is made of the steps you run and add as you run them (add true), or write without running them (core.run_node with write true): run or write each step it needs, add it, and finish again.";

/**
 * The feedback for a completion whose Flow holds `steps`, which the test cannot
 * run, each with why. No step at all is a Flow none of whose steps ran in this
 * build.
 */
export function automationStudioFlowDraftFullRunRequiredFeedback(steps: readonly { position: number; actionId: string; word: AutomationStudioFlowDraftUnrunnableWord }[]): JsonObject {
  return {
    ok: false,
    code: AUTOMATION_STUDIO_FLOW_DRAFT_FULL_RUN_REQUIRED_CODE,
    steps: steps.map((step) => ({ step: step.position, actionId: step.actionId, replayed: step.word })),
    // No step at all: the Flow was written out whole rather than added as it ran.
    instruction: steps.length ? FULL_RUN_REQUIRED_INSTRUCTION : NOTHING_RAN_INSTRUCTION
  };
}
