// @fluxiq-test-group real-sql
// Covers the assistant declarations in handlers/recordings.ts: each exposed
// endpoint takes its input's minimal example. The proposal endpoints name a
// proposal that does not exist, so what is read is that the handler, not the
// input, refuses it.

import { describe, expect, it, vi } from "vitest";

import { GlobalProgramApiRegistry } from "../../../../../../_shared/api.ts";
import { AUTOMATION_STUDIO_ENDPOINTS } from "../../../../../../../api-contracts/automation.ts";
import { registerAutomationStudioApi } from "../../../index.ts";
import { expectExampleAccepted } from "../assistant-example.ts";
import { callAcceptedExample } from "../run-example.ts";
import { createCacheApiTestService } from "../../test-service.ts";

describe("Recording endpoints for the panel assistant", () => {
  it("take the minimal example of each exposed input", async () => {
    const { service, cleanup } = await createCacheApiTestService();
    try {
      const project = await service.createProject({ name: "Assistant recordings" });
      const make = async (recordingId: string) => (await service.createRecording({ projectId: project.id, recordingId, description: recordingId, initialState: { timestamp: 0, namespaces: {} } })).recordingId;
      const [kept, gone, goneA, goneB] = [await make("recording.kept"), await make("recording.gone"), await make("recording.gone-a"), await make("recording.gone-b")];
      // Deleting asks for a PIN, which the assistant gets from a press the page makes; here a stub grants it.
      const registry = new GlobalProgramApiRegistry({ identityAccess: { authorizeSessionPin: vi.fn().mockResolvedValue({ authorized: true }) } as any });
      registerAutomationStudioApi(registry, service);
      const E = AUTOMATION_STUDIO_ENDPOINTS;
      await expectExampleAccepted(registry, E.getRecordingCapturePolicy, {});
      await expectExampleAccepted(registry, E.getRecordingCapturePolicy, { projectId: project.id });
      await expectExampleAccepted(registry, E.getRecording, { projectId: project.id, recordingId: kept });
      await expectExampleAccepted(registry, E.updateRecording, { projectId: project.id, recordingId: kept, name: "Renamed by example" });
      await expectExampleAccepted(registry, E.deleteRecording, { projectId: project.id, recordingId: gone }, { authorizationPin: "0000" });
      await expectExampleAccepted(registry, E.deleteRecordings, { projectId: project.id, recordingIds: [goneA, goneB] }, { authorizationPin: "0000" });

      await expectExampleAccepted(registry, E.getProposal, { projectId: project.id, proposalId: "proposal.none" });
      const review = await callAcceptedExample(registry, E.reviewRecordingFlowProposal, { projectId: project.id, proposalId: "proposal.none", decision: "rejected" });
      expect(review.ok).toBe(false);
      expect(review.error ?? "").not.toMatch(/payload|required|must be/iu);
    } finally {
      await cleanup();
    }
  });
});
