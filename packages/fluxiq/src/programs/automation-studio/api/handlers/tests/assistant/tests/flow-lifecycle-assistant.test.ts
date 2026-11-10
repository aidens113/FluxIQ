// @fluxiq-test-group real-sql
// Covers the assistant declarations in handlers/flow-lifecycle.ts: each exposed
// endpoint takes its input's minimal example, and the legacy ones stay hidden.

import { describe, expect, it, vi } from "vitest";

import { GlobalProgramApiRegistry } from "../../../../../../_shared/api.ts";
import { AUTOMATION_STUDIO_ENDPOINTS } from "../../../../../../../api-contracts/automation.ts";
import { registerAutomationStudioApi } from "../../../index.ts";
import { expectExampleAccepted } from "../assistant-example.ts";
import { createCacheApiTestService } from "../../test-service.ts";

describe("Flow lifecycle endpoints for the panel assistant", () => {
  it("take the minimal example of each exposed input", async () => {
    const { service, cleanup } = await createCacheApiTestService();
    try {
      const project = await service.createProject({ name: "Assistant lifecycle" });
      const flow = await service.createFlow({ projectId: project.id, name: "To publish" });
      // Deleting asks for a PIN, which the assistant gets from a press the page makes; here a stub grants it.
      const registry = new GlobalProgramApiRegistry({ identityAccess: { authorizeSessionPin: vi.fn().mockResolvedValue({ authorized: true }) } as any });
      registerAutomationStudioApi(registry, service);
      const E = AUTOMATION_STUDIO_ENDPOINTS;
      const ids = { projectId: project.id, flowId: flow.flowId };
      // A Flow publishes only once it has an active instruction.
      await expectExampleAccepted(registry, E.saveFlowInstruction, { ...ids, title: "Be brief", body: "Keep every message short." });
      await expectExampleAccepted(registry, E.inspectFlowDependencies, ids);
      await expectExampleAccepted(registry, E.listFlowPublications, ids);
      await expectExampleAccepted(registry, E.publishFlow, { ...ids, version: "1.0.0", changelog: "First version." });
      await expectExampleAccepted(registry, E.deprecateFlowPublication, { ...ids, version: "1.0.0", reason: "Replaced." });
      await expectExampleAccepted(registry, E.deleteFlow, ids, { authorizationPin: "0000" });
    } finally {
      await cleanup();
    }
  });

  it("hides the editor and legacy migration endpoints with a reason", () => {
    const registry = new GlobalProgramApiRegistry();
    registerAutomationStudioApi(registry, {} as any);
    const E = AUTOMATION_STUDIO_ENDPOINTS;
    for (const endpoint of [E.compileFlowSource, E.convertFlowToVisual, E.listPublishedFlowNodes, E.listNativeNodeDefinitions, E.migrateFlows, E.sealLegacyWrites, E.rollbackFlowMigration]) {
      const declared = registry.endpoints().find((entry) => entry.endpoint === endpoint)?.assistant;
      expect(declared, endpoint).toEqual({ hidden: expect.stringMatching(/\S/) });
    }
  });
});
