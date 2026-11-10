// @fluxiq-test-group real-sql
// Covers the assistant declarations in handlers/instructions.ts: each endpoint
// takes its input's minimal example.

import { describe, it } from "vitest";

import { GlobalProgramApiRegistry } from "../../../../../../_shared/api.ts";
import { AUTOMATION_STUDIO_ENDPOINTS } from "../../../../../../../api-contracts/automation.ts";
import { registerAutomationStudioApi } from "../../../index.ts";
import { expectExampleAccepted } from "../assistant-example.ts";
import { createCacheApiTestService } from "../../test-service.ts";

describe("Instruction endpoints for the panel assistant", () => {
  it("take the minimal example of each input", async () => {
    const { service, cleanup } = await createCacheApiTestService();
    try {
      const project = await service.createProject({ name: "Assistant instructions" });
      const flow = await service.createFlow({ projectId: project.id, name: "With rules" });
      const registry = new GlobalProgramApiRegistry();
      registerAutomationStudioApi(registry, service);
      const E = AUTOMATION_STUDIO_ENDPOINTS;
      const ids = { projectId: project.id, flowId: flow.flowId };
      const saved = await expectExampleAccepted(registry, E.saveFlowInstruction, { ...ids, title: "Be brief", body: "Keep every message short." }) as { instruction: { instructionId: string } };
      await expectExampleAccepted(registry, E.listFlowInstructions, ids);
      await expectExampleAccepted(registry, E.getFlowInstruction, { projectId: project.id, instructionId: saved.instruction.instructionId });
      await expectExampleAccepted(registry, E.getFlowInstructionSet, ids);
      await expectExampleAccepted(registry, E.getFlowInstructionReadiness, ids);
      await expectExampleAccepted(registry, E.listFlowChangeProposals, ids);
      await expectExampleAccepted(registry, E.getFlowChangeProposal, { ...ids, proposalId: "proposal.none" });
    } finally {
      await cleanup();
    }
  });
});
