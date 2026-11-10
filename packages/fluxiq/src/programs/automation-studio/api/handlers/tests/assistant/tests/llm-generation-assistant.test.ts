// @fluxiq-test-group real-sql
// Covers the assistant declarations in handlers/llm-generation.ts: each exposed
// endpoint takes its input's minimal example, and the build itself stays hidden.

import { describe, expect, it } from "vitest";

import { GlobalProgramApiRegistry } from "../../../../../../_shared/api.ts";
import { AUTOMATION_STUDIO_ENDPOINTS } from "../../../../../../../api-contracts/automation.ts";
import { registerAutomationStudioApi } from "../../../index.ts";
import { expectExampleAccepted } from "../assistant-example.ts";
import { createCacheApiTestService } from "../../test-service.ts";

describe("Build endpoints for the panel assistant", () => {
  it("take the minimal example of each exposed input", async () => {
    const { service, cleanup } = await createCacheApiTestService();
    try {
      const project = await service.createProject({ name: "Assistant builds" });
      const flow = await service.createFlow({ projectId: project.id, name: "Built" });
      const registry = new GlobalProgramApiRegistry();
      registerAutomationStudioApi(registry, service);
      const E = AUTOMATION_STUDIO_ENDPOINTS;
      const ids = { projectId: project.id, flowId: flow.flowId };
      await expectExampleAccepted(registry, E.getFlowBootstrapGenerationReadiness, {});
      await expectExampleAccepted(registry, E.getFlowBootstrapFailure, ids);
      await expectExampleAccepted(registry, E.cancelFlowBootstrap, ids);
    } finally {
      await cleanup();
    }
  });

  it("hides the build itself and the build screen's instruction save", () => {
    const registry = new GlobalProgramApiRegistry();
    registerAutomationStudioApi(registry, {} as any);
    for (const endpoint of [AUTOMATION_STUDIO_ENDPOINTS.generateFlowBootstrapAdaptation, AUTOMATION_STUDIO_ENDPOINTS.saveFlowGenerationInstruction]) {
      expect(registry.endpoints().find((entry) => entry.endpoint === endpoint)?.assistant, endpoint).toEqual({ hidden: expect.stringMatching(/\S/) });
    }
  });
});
