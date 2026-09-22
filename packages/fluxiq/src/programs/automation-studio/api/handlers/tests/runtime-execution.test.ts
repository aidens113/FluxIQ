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

// A granted run holds its grant from the moment it starts, so a Flow whose
// step fails after the grant's claim window still has its recovery.
describe("the run endpoint and a run's grant", () => {
  const granted = { projectId: "project.one", flowId: "flow.one", runIntent: "explore_and_adapt", llmExecutionGrantId: "llm-grant:one" };

  it("holds the grant for the run before the run starts", async () => {
    const order: string[] = [];
    const grants = { holdForRun: vi.fn(async () => { order.push("hold"); }), revoke: vi.fn() };
    const runRuntimeSession = vi.fn(async () => { order.push("run"); return { runId: "run.one", status: "failed" }; });
    const registry = new GlobalProgramApiRegistry();
    registerAutomationStudioApi(registry, { runRuntimeSession, getFlowRunDetail: vi.fn(async () => ({ adaptationIds: [], summary: { runId: "run.one", interventionCount: 0 } })) } as any, undefined, undefined, undefined, grants as any);

    const response = await registry.call({ programId: "automation-studio", endpoint: AUTOMATION_STUDIO_ENDPOINTS.runRuntimeSession, scope: {}, actor, payload: granted });

    expect(response).toMatchObject({ ok: true });
    expect(grants.holdForRun).toHaveBeenCalledWith({ grantId: "llm-grant:one", actorUserId: "user.one", actorSessionId: "session.one", purpose: "explore_and_adapt", projectId: "project.one", flowId: "flow.one" });
    expect(order).toEqual(["hold", "run"]);
  });

  it("refuses the run, and runs nothing, when its grant cannot be held", async () => {
    const grants = { holdForRun: vi.fn(async () => { throw new Error("LLM execution grant is unavailable."); }), revoke: vi.fn() };
    const runRuntimeSession = vi.fn();
    const registry = new GlobalProgramApiRegistry();
    registerAutomationStudioApi(registry, { runRuntimeSession } as any, undefined, undefined, undefined, grants as any);

    const response = await registry.call({ programId: "automation-studio", endpoint: AUTOMATION_STUDIO_ENDPOINTS.runRuntimeSession, scope: {}, actor, payload: granted });

    expect(response).toEqual({ ok: false, error: "LLM execution grant is unavailable." });
    expect(runRuntimeSession).not.toHaveBeenCalled();
  });
});

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
