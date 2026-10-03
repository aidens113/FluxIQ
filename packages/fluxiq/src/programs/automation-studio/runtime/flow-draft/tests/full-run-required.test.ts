// What a completion is told when its Flow holds steps that never ran in this
// build (user rule, 2026-10-02: a Flow is finished only once it ran whole from
// its start and was judged to do what was asked). A re-authored Flow's carried
// steps have nothing to run them with, so the test cannot run them, and the
// only way the Flow can be tested whole is for each to be rerun first.
import { describe, expect, it } from "vitest";
import {
  AUTOMATION_STUDIO_FLOW_DRAFT_FULL_RUN_REQUIRED_CODE,
  automationStudioFlowDraftFullRunRequiredFeedback
} from "../index.ts";

describe("the feedback for a Flow that cannot yet be run whole", () => {
  it("names each step that has not run in this build and says how to make it one that ran", () => {
    const feedback = automationStudioFlowDraftFullRunRequiredFeedback([{ position: 1, actionId: "node.open", word: "not_run_in_this_build" }, { position: 3, actionId: "node.click", word: "not_run_in_this_build" }]);
    expect(AUTOMATION_STUDIO_FLOW_DRAFT_FULL_RUN_REQUIRED_CODE).toBe("llm_evidence_loop.full_run_required");
    expect(feedback).toMatchObject({
      ok: false,
      code: AUTOMATION_STUDIO_FLOW_DRAFT_FULL_RUN_REQUIRED_CODE,
      steps: [
        { step: 1, actionId: "node.open", replayed: "not_run_in_this_build" },
        { step: 3, actionId: "node.click", replayed: "not_run_in_this_build" }
      ]
    });
    const instruction = feedback.instruction as string;
    expect(instruction).toMatch(/run whole from its start/u);
    expect(instruction).toMatch(/amend_draft/u);
    expect(instruction).toMatch(/rerun/u);
    expect(instruction).toMatch(/consequences/u);
    expect(instruction).toMatch(/core\.run_flow/u);
    // Core's words: nothing of the web.
    expect(instruction).not.toMatch(/page|click|browser|url|site/iu);
  });

  it("names each step with why the test cannot run it, and a Flow with no step that ran", () => {
    const feedback = automationStudioFlowDraftFullRunRequiredFeedback([
      { position: 1, actionId: "node.open", word: "cannot_run_again" },
      { position: 2, actionId: "domain.act", word: "not_a_library_step" }
    ]);
    expect(feedback.steps).toEqual([
      { step: 1, actionId: "node.open", replayed: "cannot_run_again" },
      { step: 2, actionId: "domain.act", replayed: "not_a_library_step" }
    ]);
    expect(feedback.instruction).toMatch(/not_a_library_step: .*core\.run_node/u);
    expect(automationStudioFlowDraftFullRunRequiredFeedback([])).toMatchObject({ steps: [], instruction: expect.stringContaining("no step of this Flow has run in this build") });
  });

  // t252: a written step inside a repeat whose listing returned no rows in the
  // test was never run, so the Flow was not tested whole.
  it("names a step the test never reached, and both tellings say a step may be written", () => {
    const feedback = automationStudioFlowDraftFullRunRequiredFeedback([{ position: 4, actionId: "node.act", word: "not_reached" }]);
    expect(feedback.steps).toEqual([{ step: 4, actionId: "node.act", replayed: "not_reached" }]);
    const instruction = feedback.instruction as string;
    expect(instruction).toMatch(/not_reached: /u);
    expect(instruction).toMatch(/write true/u);
    expect(instruction).not.toMatch(/page|click|browser|url|site/iu);
    const nothing = automationStudioFlowDraftFullRunRequiredFeedback([]).instruction as string;
    expect(nothing).toMatch(/write true/u);
    expect(nothing).not.toMatch(/page|click|browser|url|site/iu);
  });

  // t252-w9: a written step is also not reached when the test could not walk
  // the list's items and ran the repeat once on the explored item, where the
  // step did not pass. The sentence names both causes and what to do for each.
  it("says not_reached has two causes and what to do for each", () => {
    const instruction = automationStudioFlowDraftFullRunRequiredFeedback([{ position: 4, actionId: "node.act", word: "not_reached" }]).instruction as string;
    expect(instruction).toMatch(/not_reached: .*two reasons/u);
    expect(instruction).toMatch(/had no items in the test: run the listing where it returns items, or run this step once yourself/u);
    expect(instruction).toMatch(/could not go through the list's items.*make the listing run again cleanly \(rerun it\), or run this step once yourself/u);
    expect(instruction).not.toMatch(/page|click|browser|url|site/iu);
  });
});
