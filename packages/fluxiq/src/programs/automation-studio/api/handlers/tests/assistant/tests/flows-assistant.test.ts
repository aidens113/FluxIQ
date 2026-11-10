// @fluxiq-test-group real-sql
// Covers the assistant declarations in handlers/flows.ts: each exposed
// endpoint takes its input's minimal example, and the rest say why they hide.

import { describe, expect, it } from "vitest";

import { GlobalProgramApiRegistry } from "../../../../../../_shared/api.ts";
import { AUTOMATION_STUDIO_ENDPOINTS } from "../../../../../../../api-contracts/automation.ts";
import { registerAutomationStudioApi } from "../../../index.ts";
import { expectExampleAccepted } from "../assistant-example.ts";
import { createCacheApiTestService } from "../../test-service.ts";

describe("Flow endpoints for the panel assistant", () => {
  it("take the minimal example of each exposed input", async () => {
    const { service, cleanup } = await createCacheApiTestService();
    try {
      const project = await service.createProject({ name: "Assistant Flows" });
      const registry = new GlobalProgramApiRegistry();
      registerAutomationStudioApi(registry, service);
      const E = AUTOMATION_STUDIO_ENDPOINTS;
      const created = await expectExampleAccepted(registry, E.createFlow, { projectId: project.id, name: "First" }) as { flow: { flowId: string } };
      const ids = { projectId: project.id, flowId: created.flow.flowId };
      await expectExampleAccepted(registry, E.listFlows, { projectId: project.id });
      await expectExampleAccepted(registry, E.getFlow, ids);
      await expectExampleAccepted(registry, E.getFlowMetadataDetail, ids);
      await expectExampleAccepted(registry, E.updateFlowSettings, { ...ids, flow: { name: "Renamed" } });
      expect((await service.getFlow(project.id, ids.flowId)).name).toBe("Renamed");
    } finally {
      await cleanup();
    }
  });

  it("hides the editor-only endpoints with a reason", () => {
    const registry = new GlobalProgramApiRegistry();
    registerAutomationStudioApi(registry, {} as any);
    const E = AUTOMATION_STUDIO_ENDPOINTS;
    for (const endpoint of [E.listFlowSummaries, E.listFlowMetadataPage, E.saveFlow, E.applyGraphPatch, E.getGraphViewport]) {
      const declared = registry.endpoints().find((entry) => entry.endpoint === endpoint)?.assistant;
      expect(declared, endpoint).toEqual({ hidden: expect.stringMatching(/\S/) });
    }
  });
});
