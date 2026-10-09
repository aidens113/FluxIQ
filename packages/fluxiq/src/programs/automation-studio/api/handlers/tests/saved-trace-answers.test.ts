// Covers handlers/runtime-sessions.ts, runtime-execution.ts and runs.ts: a
// saved trace keeps each value once (`runtime/executor/node-execution/shared-inputs.ts`),
// and no client is ever answered with that form (t377).

import { describe, expect, it, vi } from "vitest";

import { GlobalProgramApiRegistry, type ProgramApiActor } from "../../../../_shared/api.ts";
import type { JsonValue } from "../../../../../core/index.ts";
import type { AutomationStudioFlowDocument } from "../../../model/index.ts";
import { runAutomationStudioGraph, type AutomationStudioGraphExecutionTrace, type AutomationStudioNodeAttemptTrace, type AutomationStudioService } from "../../../runtime/index.ts";
import { AUTOMATION_STUDIO_ENDPOINTS } from "../../contracts.ts";
import { registerAutomationStudioApi } from "../index.ts";

const actor: ProgramApiActor = { sessionId: "session.one", userId: "user.one", roleId: "admin", permissions: ["programs.read", "runtime.control"] };

/** Three steps, each answering with a page of its own, the shape a web step returns. */
async function threeStepRun(): Promise<{ executed: AutomationStudioGraphExecutionTrace; stored: AutomationStudioGraphExecutionTrace }> {
  const nodes = ["one", "two", "three"].map((id) => ({ id, definitionId: "builtin.policy.action", parameterValues: { outputId: "read-page", parameters: {} } }));
  const flow: AutomationStudioFlowDocument = {
    schemaVersion: "0.1", flowId: "flow.answers", ownerKind: "task", ownerId: "task.answers", name: "Answers", createdAt: 1, updatedAt: 1, nodes,
    edges: [{ id: "one.two", sourceNodeId: "one", sourcePortId: "success", targetNodeId: "two" }, { id: "two.three", sourceNodeId: "two", sourcePortId: "success", targetNodeId: "three" }]
  };
  let executed: AutomationStudioGraphExecutionTrace | undefined;
  let step = 0;
  const saved = await runAutomationStudioGraph(flow, {
    effectDispatcher: () => ({ status: "success", route: "success", outputs: { page: { url: `https://example.test/${++step}`, elements: Array.from({ length: 50 }, (_, index) => `element ${index}`) } } })
  }, (run) => { executed = run; });
  // As the store hands it back: written and read again.
  return { executed: executed!, stored: JSON.parse(JSON.stringify(saved)) as AutomationStudioGraphExecutionTrace };
}

function session(trace: AutomationStudioGraphExecutionTrace) {
  return { runId: "run.one", projectId: "project.one", flowId: "flow.answers", targetKind: "flow", targetId: "flow.answers", status: "succeeded", queuedAt: 1, trace };
}

function expectWhole(attempts: AutomationStudioNodeAttemptTrace[] | undefined, executed: AutomationStudioGraphExecutionTrace): void {
  expect(attempts).toHaveLength(3);
  for (const [index, attempt] of (attempts ?? []).entries()) {
    expect(attempt).not.toHaveProperty("inputsSince");
    expect(attempt.inputs).toEqual(JSON.parse(JSON.stringify(executed.attempts[index]!.inputs)) as Record<string, JsonValue>);
  }
  expect(attempts?.[2]?.inputs["one.page"]).toEqual(executed.attempts[0]!.outputs.page);
}

async function call(service: object, endpoint: string, payload: Record<string, unknown>) {
  const registry = new GlobalProgramApiRegistry();
  // A stub of only the methods each endpoint calls.
  registerAutomationStudioApi(registry, service as unknown as AutomationStudioService);
  const response = await registry.call({ programId: "automation-studio", endpoint, scope: {}, actor, payload });
  expect(response).toMatchObject({ ok: true });
  return (response as { payload: Record<string, any> }).payload;
}

describe("an answer carrying a saved trace", () => {
  it("is stored with each value once, which is what the endpoints are given", async () => {
    const { stored } = await threeStepRun();
    expect(stored.attempts[2]?.inputsSince).toBeDefined();
    expect(stored.attempts[2]?.inputs).not.toHaveProperty("one.page");
  });

  it("hands every attempt's whole inputs to a client reading a runtime session", async () => {
    const { executed, stored } = await threeStepRun();
    const payload = await call({ getRuntimeSession: vi.fn(async () => session(stored)) }, AUTOMATION_STUDIO_ENDPOINTS.getRuntimeSession, { projectId: "project.one", runId: "run.one" });
    expectWhole(payload.runtimeSession.trace.attempts, executed);
  });

  it("hands them to a client listing runtime sessions", async () => {
    const { executed, stored } = await threeStepRun();
    const payload = await call({ listRuntimeSessions: vi.fn(async () => [session(stored)]) }, AUTOMATION_STUDIO_ENDPOINTS.listRuntimeSessions, { projectId: "project.one" });
    expectWhole(payload.runtimeSessions[0].trace.attempts, executed);
  });

  it("hands them to a client that ran or stopped the run", async () => {
    const { executed, stored } = await threeStepRun();
    const service = {
      runRuntimeSession: vi.fn(async () => session(stored)),
      cancelRuntimeSession: vi.fn(async () => session(stored)),
      getFlowRunDetail: vi.fn(async () => ({ adaptationIds: [], summary: { runId: "run.one", interventionCount: 0 } })),
      conversations: { callerFor: () => ({ keyLocked: true, paired: false }) }
    };
    expectWhole((await call(service, AUTOMATION_STUDIO_ENDPOINTS.runRuntimeSession, { projectId: "project.one", flowId: "flow.answers" })).runtimeSession.trace.attempts, executed);
    expectWhole((await call(service, AUTOMATION_STUDIO_ENDPOINTS.cancelRuntimeSession, { projectId: "project.one", runId: "run.one" })).runtimeSession.trace.attempts, executed);
  });

  it("hands them to a client reading a run detail that keeps a repair's completed trace", async () => {
    const { executed, stored } = await threeStepRun();
    const runDetail = { summary: { runId: "run.one" }, interventions: [{ metadata: { attempts: [{ attemptId: "patch.one", completedTrace: stored }] } }] };
    const payload = await call({ getFlowRunDetail: vi.fn(async () => runDetail) }, AUTOMATION_STUDIO_ENDPOINTS.getFlowRunDetail, { projectId: "project.one", runId: "run.one" });
    expectWhole(payload.runDetail.interventions[0].metadata.attempts[0].completedTrace.attempts, executed);
  });
});
