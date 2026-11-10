// @fluxiq-test-group real-sql
// Covers the assistant declarations in handlers/workspace.ts: each exposed
// endpoint takes its input's minimal example.

import { describe, it } from "vitest";

import { GlobalProgramApiRegistry } from "../../../../../../_shared/api.ts";
import { AUTOMATION_STUDIO_ENDPOINTS } from "../../../../../../../api-contracts/automation.ts";
import { registerAutomationStudioApi } from "../../../index.ts";
import { expectExampleAccepted } from "../assistant-example.ts";
import { createCacheApiTestService } from "../../test-service.ts";

describe("Workspace endpoints for the panel assistant", () => {
  it("take the minimal example of each exposed input", async () => {
    const { service, cleanup } = await createCacheApiTestService();
    try {
      const project = await service.createProject({ name: "Assistant workspace" });
      const registry = new GlobalProgramApiRegistry();
      registerAutomationStudioApi(registry, service);
      const E = AUTOMATION_STUDIO_ENDPOINTS;
      await expectExampleAccepted(registry, E.getProjectWorkspaceSummary, { projectId: project.id });
      await expectExampleAccepted(registry, E.listRecordings, { projectId: project.id });
      await expectExampleAccepted(registry, E.listRecordings, { projectId: project.id, summaries: true });
    } finally {
      await cleanup();
    }
  });
});
