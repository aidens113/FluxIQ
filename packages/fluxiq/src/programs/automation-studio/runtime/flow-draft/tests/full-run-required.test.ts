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
});
