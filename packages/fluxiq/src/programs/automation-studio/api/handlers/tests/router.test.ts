// Covers handlers/router.ts.

import { describe, expect, it, vi } from "vitest";

import { GlobalProgramApiRegistry } from "../../../../_shared/api.ts";

import { AUTOMATION_STUDIO_ENDPOINTS } from "../../contracts.ts";
import { cacheActor } from "./test-actor.ts";
import { createCacheApiTestService } from "./test-service.ts";
import { registerAutomationStudioApi } from "../index.ts";

describe("Automation Studio Router target-reference API", () => {
  it("forwards a bounded Subflow batch and returns compact references", async () => {
    const { service, cleanup } = await createCacheApiTestService();
    try {
      const listReferences = vi.spyOn(service, "listFlowRouterTargetReferences").mockResolvedValue({
        perTargetLimit: 20,
        targets: [{ subflowId: "subflow.one", total: 1, hasMore: false, references: [{ id: "route.one", kind: "route", name: "One", status: "active", order: 1, conditionLabel: "Always" }] }]
      });
      const registry = new GlobalProgramApiRegistry();
      registerAutomationStudioApi(registry, service);
      const response = await registry.call({
        programId: "automation-studio",
        endpoint: AUTOMATION_STUDIO_ENDPOINTS.listFlowRouterTargetReferences,
        scope: {},
        actor: cacheActor("user.router-references"),
        payload: { projectId: "project.one", flowId: "flow.one", subflowIds: ["subflow.one"], perTargetLimit: 20 }
      });
      expect(listReferences).toHaveBeenCalledWith({ projectId: "project.one", flowId: "flow.one", subflowIds: ["subflow.one"], perTargetLimit: 20 });
      expect(response).toMatchObject({ ok: true, payload: { targets: [{ subflowId: "subflow.one", total: 1 }], batch: { perTargetLimit: 20 } } });
    } finally {
      await cleanup();
    }
  });
});
