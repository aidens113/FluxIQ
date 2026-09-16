// Covers handlers/subflows.ts.

import { describe, expect, it, vi } from "vitest";

import { GlobalProgramApiRegistry } from "../../../../_shared/api.ts";

import { AUTOMATION_STUDIO_ENDPOINTS } from "../../contracts.ts";
import { cacheActor } from "./test-actor.ts";
import { registerAutomationStudioApi } from "../index.ts";

describe("Automation Studio explicit legacy representation migration API", () => {
  it("requires flows.write, takes no PIN, and forwards the exact target", async () => {
    const migrateLegacyFlowRepresentation = vi.fn().mockResolvedValue({
      parentFlow: { flowId: "flow.parent" },
      subflow: { subflowId: "subflow.primary" },
      graphFlow: { flowId: "flow.graph" }
    });
    const authorizeSessionPin = vi.fn().mockResolvedValue({ authorized: true });
    // Identity Access is available to the registry; a representation migration
    // is authoring, so the registry must not reach for it.
    const registry = new GlobalProgramApiRegistry({ identityAccess: { authorizeSessionPin } as any });
    registerAutomationStudioApi(registry, { migrateLegacyFlowRepresentation } as any);

    expect(registry.endpoints()).toContainEqual({
      programId: "automation-studio",
      endpoint: AUTOMATION_STUDIO_ENDPOINTS.migrateLegacyFlowRepresentation,
      permission: "flows.write",
      classification: "authoring"
    });
    const response = await registry.call({
      programId: "automation-studio",
      endpoint: AUTOMATION_STUDIO_ENDPOINTS.migrateLegacyFlowRepresentation,
      scope: {},
      actor: { ...cacheActor("user.migration"), permissions: ["programs.read", "programs.write", "flows.write"] },
      payload: {
        projectId: "project.one",
        flowId: "flow.parent",
        subflowId: "subflow.primary",
        authSessionId: "session.user.migration"
      }
    });

    expect(authorizeSessionPin).not.toHaveBeenCalled();
    expect(migrateLegacyFlowRepresentation).toHaveBeenCalledWith({ projectId: "project.one", flowId: "flow.parent", subflowId: "subflow.primary" });
    expect(response).toMatchObject({ ok: true, payload: { parentFlow: { flowId: "flow.parent" }, subflow: { subflowId: "subflow.primary" }, graphFlow: { flowId: "flow.graph" } } });
  });
});
