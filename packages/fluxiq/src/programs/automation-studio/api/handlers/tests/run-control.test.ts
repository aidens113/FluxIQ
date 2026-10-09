// Covers pause, takeover and resume in handlers/run-control.ts, called through
// the registry the web route and the extension call.

import { afterEach, describe, expect, it } from "vitest";

import { GlobalProgramApiRegistry, type ProgramApiActor } from "../../../../_shared/api.ts";
import type { AutomationStudioFlowDocument, AutomationStudioRuntimeSession } from "../../../model/index.ts";
import type { ClientGatewayActivity } from "@fluxiq/contracts/client-gateway";
import { automationStudioActivityHub } from "../../../runtime/activity/index.ts";
import { AutomationStudioRunControlRegistry, runAutomationStudioGraph } from "../../../runtime/index.ts";
import { AUTOMATION_STUDIO_ENDPOINTS } from "../../contracts.ts";
import { registerAutomationStudioApi } from "../index.ts";
import { createRunnableCanonicalFlow } from "../../../runtime/tests/service-fixtures.ts";
import { createCacheApiTestService } from "./test-service.ts";

const actor: ProgramApiActor = { sessionId: "session.hold", userId: "user.hold", roleId: "admin", permissions: ["programs.read", "runtime.control"] };

const flow: AutomationStudioFlowDocument = {
  schemaVersion: "0.1",
  flowId: "flow.hold",
  ownerKind: "task",
  ownerId: "task.hold",
  name: "Hold",
  createdAt: 1,
  updatedAt: 1,
  nodes: [
    { id: "sign-in", definitionId: "builtin.policy.action", parameterValues: { outputId: "activate-element", parameters: { elementId: "sign-in" } } },
    { id: "export", definitionId: "builtin.policy.action", parameterValues: { outputId: "activate-element", parameters: { elementId: "export" } } }
  ],
  edges: [{ id: "sign-in.export", sourceNodeId: "sign-in", targetNodeId: "export", sourcePortId: "success" }]
};

function session(status: AutomationStudioRuntimeSession["status"]): AutomationStudioRuntimeSession {
  return { schemaVersion: "0.1", runId: "run.one", projectId: "project.one", targetKind: "flow", targetId: flow.flowId, flowId: flow.flowId, status, queuedAt: 1, flow };
}

function world(status: AutomationStudioRuntimeSession["status"] | null = "running") {
  const runControl = new AutomationStudioRunControlRegistry();
  const state = { status };
  const service = { runControl, getRuntimeSession: async (_projectId: string, runId: string) => state.status && runId === "run.one" ? session(state.status) : null };
  const registry = new GlobalProgramApiRegistry();
  registerAutomationStudioApi(registry, service as never);
  const call = (endpoint: string, payload: unknown, as: ProgramApiActor = actor) => registry.call({ programId: "automation-studio", endpoint, scope: {}, actor: as, payload });
  return { runControl, state, registry, call };
}

async function untilPaused(runControl: AutomationStudioRunControlRegistry): Promise<void> {
  for (let turn = 0; turn < 200 && runControl.snapshot("project.one", "run.one")?.state !== "paused"; turn += 1) await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("the run-control endpoints", () => {
  it("are registered: holding and resuming under runtime.control as authoring, reading as a read", () => {
    const { registry } = world();
    expect(registry.endpoints()).toEqual(expect.arrayContaining([
      { programId: "automation-studio", endpoint: "pause-runtime-session", permission: "runtime.control", classification: "authoring" },
      { programId: "automation-studio", endpoint: "resume-runtime-session", permission: "runtime.control", classification: "authoring" },
      { programId: "automation-studio", endpoint: "get-runtime-run-control", permission: "programs.read", classification: "read" }
    ]));
  });

  it("pauses a live run between steps, hands the page to a person, and continues after their action", async () => {
    const { runControl, call } = world();
    const dispatched: string[] = [];
    const gate = runControl.open("project.one", "run.one");
    let taken: Promise<unknown> | undefined;
    const running = runAutomationStudioGraph(flow, {
      runControl: gate,
      effectDispatcher: (effect) => {
        const elementId = String((effect.payload as { parameters?: { elementId?: unknown } }).parameters?.elementId);
        dispatched.push(elementId);
        if (elementId === "sign-in") taken = call(AUTOMATION_STUDIO_ENDPOINTS.pauseRuntimeSession, { projectId: "project.one", runId: "run.one", takeControl: true, reason: "Solve the CAPTCHA." });
        return { status: "success", route: "success", outputs: {} };
      }
    });
    for (let turn = 0; turn < 200 && !taken; turn += 1) await new Promise((resolve) => setTimeout(resolve, 0));
    expect(await taken).toMatchObject({ ok: true, payload: { live: true, sessionStatus: "running", runControl: { state: "pause_requested", holder: "person" } } });
    await untilPaused(runControl);

    const read = await call(AUTOMATION_STUDIO_ENDPOINTS.getRuntimeRunControl, { projectId: "project.one", runId: "run.one" });
    expect(read).toMatchObject({ ok: true, payload: { live: true, runControl: { state: "paused", nodeId: "export" }, progress: { status: "user_action_required" } } });
    expect(dispatched).toEqual(["sign-in"]);

    const resumed = await call(AUTOMATION_STUDIO_ENDPOINTS.resumeRuntimeSession, { projectId: "project.one", runId: "run.one", afterManualAction: true, note: "Done." });
    expect(resumed).toMatchObject({ ok: true, payload: { live: true, runControl: { state: "running" }, progress: { status: "running" } } });
    expect((await running).status).toBe("succeeded");
    expect(dispatched).toEqual(["sign-in", "export"]);
    expect(runControl.close("project.one", "run.one")?.history.at(-1)).toMatchObject({ kind: "resumed", nodeId: "export", afterManualAction: true, note: "Done." });
  });

  it("answers a run that is not executing here with no control rather than an error", async () => {
    for (const status of ["queued", "waiting", "succeeded", "cancelled"] as const) {
      const { call } = world(status);
      const paused = await call(AUTOMATION_STUDIO_ENDPOINTS.pauseRuntimeSession, { projectId: "project.one", runId: "run.one" });
      expect(paused).toMatchObject({ ok: true, payload: { runId: "run.one", sessionStatus: status, live: false, runControl: null } });
    }
    const { call } = world(null);
    expect(await call(AUTOMATION_STUDIO_ENDPOINTS.resumeRuntimeSession, { projectId: "project.one", runId: "run.gone" })).toEqual({
      ok: true,
      payload: { runId: "run.gone", sessionStatus: null, live: false, runControl: null, progress: null }
    });
  });

  it("never reports a run that has ended as held, even while its control is still open", async () => {
    const { runControl, state, call } = world();
    runControl.open("project.one", "run.one");
    runControl.pause("project.one", "run.one");
    state.status = "succeeded";
    expect(await call(AUTOMATION_STUDIO_ENDPOINTS.getRuntimeRunControl, { projectId: "project.one", runId: "run.one" })).toMatchObject({
      ok: true, payload: { live: false, runControl: null, progress: { status: "completed" } }
    });
  });

  it("answers a host with no run control as not live", async () => {
    const registry = new GlobalProgramApiRegistry();
    registerAutomationStudioApi(registry, { getRuntimeSession: async () => session("running") } as never);
    const response = await registry.call({ programId: "automation-studio", endpoint: AUTOMATION_STUDIO_ENDPOINTS.pauseRuntimeSession, scope: {}, actor, payload: { projectId: "project.one", runId: "run.one" } });
    expect(response).toMatchObject({ ok: true, payload: { live: false, runControl: null, progress: { status: "running" } } });
  });

  it("refuses a request that does not name the run, or mistypes a flag", async () => {
    const { call } = world();
    expect(await call(AUTOMATION_STUDIO_ENDPOINTS.pauseRuntimeSession, { projectId: "project.one" })).toEqual({ ok: false, error: "Pausing a run needs its project and run IDs." });
    expect(await call(AUTOMATION_STUDIO_ENDPOINTS.resumeRuntimeSession, { runId: "run.one" })).toEqual({ ok: false, error: "Resuming a run needs its project and run IDs." });
    expect(await call(AUTOMATION_STUDIO_ENDPOINTS.pauseRuntimeSession, { projectId: "project.one", runId: "run.one", takeControl: "yes" })).toEqual({ ok: false, error: "takeControl must be true or false." });
    expect(await call(AUTOMATION_STUDIO_ENDPOINTS.resumeRuntimeSession, { projectId: "project.one", runId: "run.one", afterManualAction: 1 })).toEqual({ ok: false, error: "afterManualAction must be true or false." });
  });

  it("requires runtime.control to hold or resume a run", async () => {
    const { call } = world();
    const reader: ProgramApiActor = { ...actor, permissions: ["programs.read"] };
    expect(await call(AUTOMATION_STUDIO_ENDPOINTS.pauseRuntimeSession, { projectId: "project.one", runId: "run.one" }, reader)).toMatchObject({ ok: false, errorCode: "authorization.forbidden" });
    expect(await call(AUTOMATION_STUDIO_ENDPOINTS.resumeRuntimeSession, { projectId: "project.one", runId: "run.one" }, reader)).toMatchObject({ ok: false, errorCode: "authorization.forbidden" });
    expect(await call(AUTOMATION_STUDIO_ENDPOINTS.getRuntimeRunControl, { projectId: "project.one", runId: "run.one" }, reader)).toMatchObject({ ok: true });
  });
});

describe("pausing a real service run", () => {
  const cleanups: Array<() => Promise<void>> = [];
  afterEach(async () => {
    for (const cleanup of cleanups.splice(0)) await cleanup();
  });

  async function realWorld() {
    const { service, cleanup } = await createCacheApiTestService();
    cleanups.push(cleanup);
    const project = await service.createProject({ name: "Run Control" });
    const flow = await createRunnableCanonicalFlow(service, project.id, { flowId: "flow.run-control" });
    const registry = new GlobalProgramApiRegistry();
    registerAutomationStudioApi(registry, service);
    const call = (endpoint: string, payload: unknown) => registry.call<unknown, any>({ programId: "automation-studio", endpoint, scope: {}, actor, payload });
    const start = async () => (await service.startRuntimeSession({ projectId: project.id, flowId: flow.flowId })).runId;
    const until = async (condition: () => boolean, what: string) => {
      for (let turn = 0; turn < 2_000 && !condition(); turn += 1) await new Promise((resolve) => setTimeout(resolve, 1));
      if (!condition()) throw new Error(`Timed out waiting for ${what}.`);
    };
    return { service, projectId: project.id, flowId: flow.flowId, call, start, until };
  }

  const shape = (session: AutomationStudioRuntimeSession) => ({ status: session.status, attempts: session.trace?.attempts.map((attempt) => [attempt.nodeId, attempt.status, attempt.route]) });

  it("holds between nodes, keeps the run running and its record untouched, and resumes to the same completion as an unpaused run", async () => {
    const { service, projectId, flowId, call, start, until } = await realWorld();
    const unpaused = await service.runRuntimeSession({ projectId, flowId, runId: await start(), adaptiveMode: "no_llm_intervention" });
    expect(unpaused.status).toBe("succeeded");

    const runId = await start();
    const running = service.runRuntimeSession({ projectId, flowId, runId, adaptiveMode: "no_llm_intervention" });
    await until(() => service.runControl.snapshot(projectId, runId) !== null, "the run to open");
    expect(await call(AUTOMATION_STUDIO_ENDPOINTS.pauseRuntimeSession, { projectId, runId, reason: "Look at the page." })).toMatchObject({ ok: true, payload: { live: true } });
    await until(() => service.runControl.snapshot(projectId, runId)?.state === "paused", "the run to hold");
    const first = service.runControl.snapshot(projectId, runId)!;

    // Resumed and paused again in one turn: the run takes exactly one step and holds before the next.
    service.runControl.resume(projectId, runId);
    service.runControl.pause(projectId, runId, { holder: "person", reason: "Sign in by hand." });
    await until(() => service.runControl.snapshot(projectId, runId)?.state === "paused", "the run to hold again");
    const second = service.runControl.snapshot(projectId, runId)!;
    expect(second.step).toBe(first.step! + 1);
    expect(second.nodeId).not.toBe(first.nodeId);

    const held = await call(AUTOMATION_STUDIO_ENDPOINTS.getRuntimeRunControl, { projectId, runId });
    expect(held).toMatchObject({ ok: true, payload: { live: true, sessionStatus: "running", runControl: { state: "paused", holder: "person", nodeId: second.nodeId }, progress: { status: "user_action_required" } } });
    expect((await service.getRuntimeSession(projectId, runId))?.status).toBe("running");

    // The resume took effect; the run may already have finished by the time the answer reads it.
    expect(await call(AUTOMATION_STUDIO_ENDPOINTS.resumeRuntimeSession, { projectId, runId, afterManualAction: true })).toMatchObject({ ok: true, payload: { live: true } });
    const finished = await running;
    expect(shape(finished)).toEqual(shape(unpaused));
    expect((await service.getRuntimeSession(projectId, runId))?.status).toBe("succeeded");
    // The run is closed: its control is gone, and asking again is not an error.
    expect(service.runControl.snapshot(projectId, runId)).toBeNull();
    expect(await call(AUTOMATION_STUDIO_ENDPOINTS.getRuntimeRunControl, { projectId, runId })).toMatchObject({ ok: true, payload: { live: false, runControl: null, progress: { status: "completed" } } });
  }, 60_000);

  it("ends a held run as stopped when it is cancelled", async () => {
    const { service, projectId, flowId, call, start, until } = await realWorld();
    const seen: ClientGatewayActivity[] = [];
    const unsubscribe = automationStudioActivityHub.subscribe((event) => seen.push(event));
    cleanups.push(async () => unsubscribe());
    const runId = await start();
    const running = service.runRuntimeSession({ projectId, flowId, runId, adaptiveMode: "no_llm_intervention" });
    await until(() => service.runControl.snapshot(projectId, runId) !== null, "the run to open");
    await call(AUTOMATION_STUDIO_ENDPOINTS.pauseRuntimeSession, { projectId, runId, takeControl: true });
    await until(() => service.runControl.snapshot(projectId, runId)?.state === "paused", "the run to hold");

    expect(await call(AUTOMATION_STUDIO_ENDPOINTS.cancelRuntimeSession, { projectId, runId })).toMatchObject({ ok: true, payload: { runtimeSession: { status: "cancelled" } } });
    await running;
    expect((await service.getRuntimeSession(projectId, runId))?.status).toBe("cancelled");
    expect(service.runControl.snapshot(projectId, runId)).toBeNull();
    // On the run's own activity: held once as a takeover, never "continuing", and ended as stopped (t376).
    const own = seen.filter((event) => event.subject.kind === "run" && event.subject.id === runId);
    expect(own.filter((event) => event.phase === "paused").map((event) => event.label)).toEqual(["Paused: you have the page"]);
    expect(own.some((event) => event.label.startsWith("Continuing"))).toBe(false);
    expect(own.at(-1)).toMatchObject({ phase: "failed", final: true, stopped: true, label: "Run cancelled" });
  }, 60_000);
});
