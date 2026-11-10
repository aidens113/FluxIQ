// @fluxiq-test-group real-sql
// Covers the assistant declarations in handlers/runs.ts: each endpoint takes its input's minimal example.

import { describe, expect, it } from "vitest";

import { AUTOMATION_STUDIO_ENDPOINTS } from "../../../../../../../api-contracts/automation.ts";
import { assistantTestActor, expectExampleAccepted } from "../assistant-example.ts";
import { createRunExample } from "../run-example.ts";

describe("Run endpoints for the panel assistant", () => {
  it("take the minimal example of each input", async () => {
    const { registry, cleanup, projectId, flowId, runId } = await createRunExample();
    try {
      const E = AUTOMATION_STUDIO_ENDPOINTS;
      const run = { projectId, runId };
      await expectExampleAccepted(registry, E.listFlowRuns, { projectId, flowId });
      await expectExampleAccepted(registry, E.getFlowRunDetail, run);
      await expectExampleAccepted(registry, E.getFlowSpend, { projectId, flowId });
      await expectExampleAccepted(registry, E.exportFlowRunAudit, run);
      await expectExampleAccepted(registry, E.listFlowRunActions, run);
      await expectExampleAccepted(registry, E.getFlowRunActionDetail, { ...run, attemptId: "attempt.none" });
      await expectExampleAccepted(registry, E.listFlowRunEvents, run);
      await expectExampleAccepted(registry, E.getFlowRunEventDetail, { ...run, sequence: 1 });
      await expectExampleAccepted(registry, E.listFlowAdaptations, { projectId, flowId });
      await expectExampleAccepted(registry, E.getFlowAdaptation, { projectId, flowId, adaptationId: "adaptation.none" });
      // No change was proposed to review, so the handler refuses it by name; its input still accepts the example.
      const review = { projectId, flowId, adaptationId: "adaptation.none", action: "reject", reason: "Not needed." };
      const declared = registry.endpoints().find((entry) => entry.endpoint === E.reviewFlowAdaptation)?.assistant;
      expect(declared !== undefined && "input" in declared ? declared.input.read(review).ok : false).toBe(true);
      const reviewed = await registry.call({ programId: "automation-studio", endpoint: E.reviewFlowAdaptation, scope: {}, actor: assistantTestActor, payload: review });
      expect(reviewed.error).toMatch(/Unknown adaptation/u);
    } finally {
      await cleanup();
    }
  });
});
