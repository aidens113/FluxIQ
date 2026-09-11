// Covers handlers/instructions.ts.

import { describe, expect, it, vi } from "vitest";

import { GlobalProgramApiRegistry } from "../../../../_shared/api.ts";

import { AUTOMATION_STUDIO_ENDPOINTS } from "../../contracts.ts";
import { registerAutomationStudioApi } from "../index.ts";

describe("Automation Studio instruction readiness API", () => {
  it("forwards a bounded active-only instruction summary query", async () => {
    const listFlowInstructionSummaries = vi.fn().mockResolvedValue({
      instructions: [{ instructionId: "instruction.active", status: "active" }],
      total: 1,
      limit: 1,
      offset: 0
    });
    const registry = new GlobalProgramApiRegistry();
    registerAutomationStudioApi(registry, { listFlowInstructionSummaries } as any);
    const response = await registry.call({
      programId: "automation-studio",
      endpoint: AUTOMATION_STUDIO_ENDPOINTS.listFlowInstructions,
      scope: {},
      actor: { sessionId: "session.readiness", userId: "user.readiness", roleId: "admin", permissions: ["programs.read"] },
      payload: { projectId: "project.one", flowId: "flow.one", status: "active", limit: 1, offset: 0 }
    });
    expect(listFlowInstructionSummaries).toHaveBeenCalledWith({ projectId: "project.one", flowId: "flow.one", status: "active", limit: 1, offset: 0 });
    expect(response).toMatchObject({ ok: true, payload: { instructions: [{ instructionId: "instruction.active", status: "active" }], page: { total: 1, limit: 1, offset: 0 } } });
  });
});
