import type { DraftPresentation } from "../../../../../runtime/flow-authoring/draft/presentation/index.ts";

const FULL_RUN_REQUIRED_INSTRUCTION = "The Flow is finished only once it has run whole from its start and been judged to do what was asked. "
  + "These steps cannot be run again as they stand, so the Flow cannot be tested whole until they can; the Flow's other steps are run as they stand, and need nothing done to them. "
  + "not_run_in_this_build: the step came from the Flow being changed and cannot be run as that Flow saved it -- it was changed since, or that Flow kept too little to run it -- so it has to run in this build; a rerun of it is first put back where its node started in the run being repaired, where that run recorded it. "
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

export const automationStudioFlowDraftFullRunInstruction: DraftPresentation["fullRunRequired"] = ({ nothingRan }) => nothingRan ? NOTHING_RAN_INSTRUCTION : FULL_RUN_REQUIRED_INSTRUCTION;
