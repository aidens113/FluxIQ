// Covers handlers/runtime-execution.ts: what the run endpoint answers once the
// run has ended.

import { describe, expect, it, vi } from "vitest";

import { GlobalProgramApiRegistry, type ProgramApiActor } from "../../../../_shared/api.ts";

import { AUTOMATION_STUDIO_ENDPOINTS } from "../../contracts.ts";
import { registerAutomationStudioApi } from "../index.ts";

const actor: ProgramApiActor = { sessionId: "session.one", userId: "user.one", roleId: "admin", permissions: ["runtime.control"] };

async function runWith(getFlowRunDetail: () => Promise<unknown>) {
  const runRuntimeSession = vi.fn().mockResolvedValue({ runId: "run.one", status: "succeeded", trace: { message: "Done." } });
  const registry = new GlobalProgramApiRegistry();
  registerAutomationStudioApi(registry, { runRuntimeSession, getFlowRunDetail: vi.fn(getFlowRunDetail) } as any);
  const response = await registry.call({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.runRuntimeSession,
    scope: {},
    actor,
    payload: { projectId: "project.one", flowId: "flow.one" }
  });
  return { response, runRuntimeSession };
}

describe("the run endpoint's answer", () => {
  it("reports the run's summary, adaptations and durable change from its detail", async () => {
    const { response } = await runWith(async () => ({
      adaptationIds: ["adaptation.applied"],
      summary: { runId: "run.one", interventionCount: 1 },
      metadata: { runtimePatchAttempts: [{ adaptationId: "adaptation.applied", approvalDecision: { autoApply: true } }] }
    }));

    expect(response).toEqual({
      ok: true,
      payload: {
        runtimeSession: expect.objectContaining({ runId: "run.one" }),
        runSummary: { runId: "run.one", interventionCount: 1 },
        runDetailLink: { endpoint: AUTOMATION_STUDIO_ENDPOINTS.getFlowRunDetail, runId: "run.one" },
        createdAdaptationIds: ["adaptation.applied"],
        interventionCount: 1,
        terminalReason: "Done.",
        durableBehaviorChanged: true
      }
    });
  });

  it("fails, naming the ended run, when the run's detail cannot be read, instead of reporting no change", async () => {
    const { response, runRuntimeSession } = await runWith(async () => { throw new Error("database disk image is malformed"); });

    expect(runRuntimeSession).toHaveBeenCalledTimes(1);
    expect(response).toEqual({
      ok: false,
      error: "Run run.one ended succeeded, but its run detail could not be read: database disk image is malformed",
      payload: {
        runtimeSession: expect.objectContaining({ runId: "run.one", status: "succeeded" }),
        runDetailLink: { endpoint: AUTOMATION_STUDIO_ENDPOINTS.getFlowRunDetail, runId: "run.one" }
      }
    });
  });
});
