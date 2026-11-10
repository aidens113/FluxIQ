// @fluxiq-test-group real-sql
// Covers the assistant declarations in handlers/projects.ts: each exposed
// endpoint takes its input's minimal example.

import { describe, it, vi } from "vitest";

import { GlobalProgramApiRegistry } from "../../../../../../_shared/api.ts";
import { AUTOMATION_STUDIO_ENDPOINTS } from "../../../../../../../api-contracts/automation.ts";
import { registerAutomationStudioApi } from "../../../index.ts";
import { expectExampleAccepted } from "../assistant-example.ts";
import { createCacheApiTestService } from "../../test-service.ts";

describe("Project endpoints for the panel assistant", () => {
  it("take the minimal example of each exposed input", async () => {
    const { service, cleanup } = await createCacheApiTestService();
    try {
      const project = await service.createProject({ name: "Assistant projects" });
      const doomed = await service.createProject({ name: "Assistant doomed" });
      const category = await service.createProjectCategory({ name: "Assistant category" });
      const spare = await service.createProjectCategory({ name: "Assistant spare" });
      // Deleting asks for a PIN, which the assistant gets from a press the page makes; here a stub grants it.
      const registry = new GlobalProgramApiRegistry({ identityAccess: { authorizeSessionPin: vi.fn().mockResolvedValue({ authorized: true }) } as any });
      registerAutomationStudioApi(registry, service);
      const E = AUTOMATION_STUDIO_ENDPOINTS;
      await expectExampleAccepted(registry, E.projects, {});
      await expectExampleAccepted(registry, E.listProjectProblems, { projectId: project.id });
      await expectExampleAccepted(registry, E.createProject, { name: "Created by example" });
      await expectExampleAccepted(registry, E.updateProject, { projectId: project.id, name: "Renamed by example" });
      await expectExampleAccepted(registry, E.createProjectCategory, { name: "Created category" });
      await expectExampleAccepted(registry, E.updateProjectCategory, { categoryId: category.id, name: "Renamed category" });
      await expectExampleAccepted(registry, E.deleteProjectCategory, { categoryId: spare.id }, { authorizationPin: "0000" });
      await expectExampleAccepted(registry, E.deleteProject, { projectId: doomed.id }, { authorizationPin: "0000" });
    } finally {
      await cleanup();
    }
  });
});
