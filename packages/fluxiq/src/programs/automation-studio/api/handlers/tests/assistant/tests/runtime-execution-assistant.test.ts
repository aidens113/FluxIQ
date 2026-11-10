// @fluxiq-test-group real-sql
// Covers the assistant declarations in handlers/runtime-execution.ts: starting, running and stopping take
// their input's minimal example, and the recorder and editor endpoints say why they hide.

import { describe, expect, it } from "vitest";

import { AUTOMATION_STUDIO_ENDPOINTS } from "../../../../../../../api-contracts/automation.ts";
import { expectExampleAccepted } from "../assistant-example.ts";
import { callAcceptedExample, createRunExample } from "../run-example.ts";

describe("Runtime execution endpoints for the panel assistant", () => {
  it("take the minimal example of each exposed input", async () => {
    const { registry, cleanup, projectId, flowId, runId } = await createRunExample();
    try {
      const E = AUTOMATION_STUDIO_ENDPOINTS;
      const started = await expectExampleAccepted(registry, E.startRuntimeSession, { projectId, flowId, inputs: {} }) as { runtimeSession: { runId: string } };
      await expectExampleAccepted(registry, E.cancelRuntimeSession, { projectId, runId: started.runtimeSession.runId, reason: "No longer needed." });
      // Running executes the Flow; whatever it comes to, the handler must take the input rather than refuse it as a payload.
      const ran = await callAcceptedExample(registry, E.runRuntimeSession, { projectId, flowId, runId, maxSteps: 5 });
      expect(ran.error ?? "").not.toMatch(/payload|invalid|needs/iu);
    } finally {
      await cleanup();
    }
  });

  it("hides the recorder and editor endpoints with a reason", async () => {
    const { registry, cleanup } = await createRunExample();
    try {
      const E = AUTOMATION_STUDIO_ENDPOINTS;
      for (const endpoint of [E.inspectStateDiff, E.listSignalRegistries, E.listRecordingDomains, E.validateRecordingDomainEvent, E.appendRecordingDomainEvent]) {
        const declared = registry.endpoints().find((entry) => entry.endpoint === endpoint)?.assistant;
        expect(declared, endpoint).toEqual({ hidden: expect.stringMatching(/\S/) });
      }
    } finally {
      await cleanup();
    }
  });
});
