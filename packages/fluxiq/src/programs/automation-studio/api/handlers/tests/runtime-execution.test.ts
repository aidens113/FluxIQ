// Covers handlers/runtime-execution.ts: what the run endpoint answers once the
// run has ended.

import { describe, expect, it, vi } from "vitest";

import { GlobalProgramApiRegistry, type ProgramApiActor } from "../../../../_shared/api.ts";

import { AUTOMATION_STUDIO_ENDPOINTS } from "../../contracts.ts";
import { automationStudioConversationEffectiveCaller } from "../../../runtime/conversations/commands/index.ts";
import { registerAutomationStudioApi } from "../index.ts";

const actor: ProgramApiActor = { sessionId: "session.one", userId: "user.one", roleId: "admin", permissions: ["runtime.control"] };

/** The service's conversations, answering `callerFor` the way Core does, with the person's unlocked session (or none). */
function conversationsWith(unlockedSession: string | null) {
  return { callerFor: (who: { userId: string; sessionId: string }) => automationStudioConversationEffectiveCaller(who, () => unlockedSession) };
}

async function runWith(getFlowRunDetail: () => Promise<unknown>) {
  const runRuntimeSession = vi.fn().mockResolvedValue({ runId: "run.one", status: "succeeded", trace: { message: "Done." } });
  const registry = new GlobalProgramApiRegistry();
  registerAutomationStudioApi(registry, { runRuntimeSession, getFlowRunDetail: vi.fn(getFlowRunDetail), conversations: conversationsWith(null) } as any);
  const response = await registry.call({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.runRuntimeSession,
    scope: {},
    actor,
    payload: { projectId: "project.one", flowId: "flow.one" }
  });
  return { response, runRuntimeSession };
}

// A run the model takes part in needs no grant (t186): its intent and the
// signed-in person are enough, and nothing is held or checked before it starts.
describe("the run endpoint and a run's model intent", () => {
  /** The run endpoint's handler, called directly so a request with no actor reaches it. */
  function runHandler(service: object) {
    const handlers = new Map<string, (request: unknown) => unknown>();
    registerAutomationStudioApi({ register: (registration: { endpoint: string; handler: (request: unknown) => unknown }) => { handlers.set(registration.endpoint, registration.handler); } } as any, service as any);
    return handlers.get(AUTOMATION_STUDIO_ENDPOINTS.runRuntimeSession)!;
  }

  it("makes the run's llmExecution from runIntent and the signed-in actor, with nothing held first", async () => {
    const runRuntimeSession = vi.fn(async () => ({ runId: "run.one", status: "failed" }));
    const registry = new GlobalProgramApiRegistry();
    registerAutomationStudioApi(registry, { runRuntimeSession, getFlowRunDetail: vi.fn(async () => ({ adaptationIds: [], summary: { runId: "run.one", interventionCount: 0 } })), conversations: conversationsWith("session.unlocked") } as any);

    const response = await registry.call({ programId: "automation-studio", endpoint: AUTOMATION_STUDIO_ENDPOINTS.runRuntimeSession, scope: {}, actor, payload: { projectId: "project.one", flowId: "flow.one", runIntent: "explore_and_adapt" } });

    expect(response).toMatchObject({ ok: true });
    expect(runRuntimeSession).toHaveBeenCalledWith({ projectId: "project.one", flowId: "flow.one", llmExecution: { actorUserId: "user.one", actorSessionId: "session.one", intent: "explore_and_adapt" } });
    // A person's own run pays for every result check it makes, as it always has (MVP item 23).
    expect((runRuntimeSession.mock.calls[0] as unknown[])[0]).not.toHaveProperty("resultCheckCallerPays");
  });

  // The extension's Automations Run calls as a paired client, under a session
  // Secret Keys never releases a key to; its model pays with the approving
  // person's unlocked session, the way a chat turn's does.
  const paired: ProgramApiActor = { sessionId: "client-gateway:gateway.one", userId: "user.one", roleId: "paired", permissions: ["runtime.control"] };

  async function pairedRun(unlockedSession: string | null, payload: Record<string, unknown>) {
    const runRuntimeSession = vi.fn(async () => ({ runId: "run.one", status: "succeeded" }));
    const registry = new GlobalProgramApiRegistry();
    registerAutomationStudioApi(registry, { runRuntimeSession, getFlowRunDetail: vi.fn(async () => ({ adaptationIds: [], summary: { runId: "run.one", interventionCount: 0 } })), conversations: conversationsWith(unlockedSession) } as any);
    const response = await registry.call({ programId: "automation-studio", endpoint: AUTOMATION_STUDIO_ENDPOINTS.runRuntimeSession, scope: {}, actor: paired, payload: { projectId: "project.one", flowId: "flow.one", ...payload } });
    return { response, runRuntimeSession };
  }

  // The person's key pays only for the result checks that judge a repair, never
  // for the routine sampling of an Automations Run (MVP item 23).
  it("runs a paired client's model run under the person's unlocked session, paying only for repair checks", async () => {
    const { response, runRuntimeSession } = await pairedRun("session.unlocked", { runIntent: "explore_and_adapt" });

    expect(response).toMatchObject({ ok: true });
    expect(runRuntimeSession).toHaveBeenCalledWith({ projectId: "project.one", flowId: "flow.one", llmExecution: { actorUserId: "user.one", actorSessionId: "session.unlocked", intent: "explore_and_adapt" }, resultCheckCallerPays: "repair_checks" });
  });

  it("runs a paired client's Flow deterministically, without a model, when the person has no unlocked session", async () => {
    const { response, runRuntimeSession } = await pairedRun(null, { runIntent: "explore_and_adapt" });

    expect(response).toMatchObject({ ok: true, payload: { runtimeSession: { runId: "run.one" } } });
    expect(runRuntimeSession).toHaveBeenCalledTimes(1);
    expect(runRuntimeSession).toHaveBeenCalledWith({ projectId: "project.one", flowId: "flow.one" });
    expect(Object.keys((response as { payload: object }).payload).sort()).toEqual(["createdAdaptationIds", "durableBehaviorChanged", "interventionCount", "runDetailLink", "runSummary", "runtimeSession", "terminalReason"]);
  });

  it("still refuses an intent Core does not support from a paired client, and runs nothing", async () => {
    const { response, runRuntimeSession } = await pairedRun("session.unlocked", { runIntent: "spend_freely" });

    expect(response).toEqual({ ok: false, error: "The run intent is not one Core supports." });
    expect(runRuntimeSession).not.toHaveBeenCalled();
  });

  it("refuses a run intent with no signed-in person, and runs nothing", async () => {
    const runRuntimeSession = vi.fn();
    const handler = runHandler({ runRuntimeSession });

    await expect(handler({ programId: "automation-studio", endpoint: AUTOMATION_STUDIO_ENDPOINTS.runRuntimeSession, scope: {}, payload: { projectId: "project.one", flowId: "flow.one", runIntent: "verify_result" } }))
      .resolves.toEqual({ ok: false, error: "A run the model takes part in needs a signed-in person." });
    expect(runRuntimeSession).not.toHaveBeenCalled();
  });

  it("runs a plain run, without a model intent, with no llmExecution", async () => {
    const { runRuntimeSession } = await runWith(async () => null);
    expect(runRuntimeSession).toHaveBeenCalledWith({ projectId: "project.one", flowId: "flow.one" });
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
