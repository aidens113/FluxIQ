// Covers the stop endpoint in handlers/runtime-execution.ts.
//
// `cancel-runtime-session` was declared in the endpoint list and implemented on
// the service, and nothing registered it, so every Stop in the product -- the
// web panel's run controls, the conversation's "stop that run", and the browser
// extension's Stop -- was answered `endpoint.not_found`. These tests call the
// endpoint through the registry the web route calls, which is where the 404
// came from.

import { afterEach, describe, expect, it, vi } from "vitest";

import { GlobalProgramApiRegistry, type ProgramApiActor } from "../../../../_shared/api.ts";

import { AUTOMATION_STUDIO_ENDPOINTS } from "../../contracts.ts";
import { createRunnableCanonicalFlow } from "../../../runtime/tests/service-fixtures.ts";
import { registerAutomationStudioApi } from "../index.ts";
import { createCacheApiTestService } from "./test-service.ts";

const actor: ProgramApiActor = { sessionId: "session.stop", userId: "user.stop", roleId: "admin", permissions: ["programs.read", "runtime.control"] };

function registryWith(service: unknown): GlobalProgramApiRegistry {
  const registry = new GlobalProgramApiRegistry();
  registerAutomationStudioApi(registry, service as never);
  return registry;
}

function cancel(registry: GlobalProgramApiRegistry, payload: unknown, as: ProgramApiActor = actor) {
  return registry.call({ programId: "automation-studio", endpoint: AUTOMATION_STUDIO_ENDPOINTS.cancelRuntimeSession, scope: {}, actor: as, payload });
}

describe("the stop endpoint", () => {
  const cleanups: Array<() => Promise<void>> = [];
  afterEach(async () => {
    for (const cleanup of cleanups.splice(0)) await cleanup();
  });

  it("is registered, under runtime.control, as authoring rather than destructive", () => {
    const registry = registryWith({});
    expect(registry.endpoints()).toContainEqual({
      programId: "automation-studio",
      endpoint: "cancel-runtime-session",
      permission: "runtime.control",
      classification: "authoring"
    });
  });

  it("no longer answers not-found, and hands the service the run to stop", async () => {
    const cancelRuntimeSession = vi.fn(async () => ({ runId: "run.one", status: "cancelled" }));
    const response = await cancel(registryWith({ cancelRuntimeSession }), { projectId: "project.one", runId: "run.one" });

    expect(response.errorCode).toBeUndefined();
    expect(response).toEqual({ ok: true, payload: { runtimeSession: { runId: "run.one", status: "cancelled" } } });
    expect(cancelRuntimeSession).toHaveBeenCalledWith("project.one", "run.one", undefined);
  });

  it("passes a stated reason on, and answers a run that does not exist with null", async () => {
    const cancelRuntimeSession = vi.fn(async () => null);
    const response = await cancel(registryWith({ cancelRuntimeSession }), { projectId: "project.one", runId: "run.gone", reason: "  Stopped from the extension.  " });

    expect(response).toEqual({ ok: true, payload: { runtimeSession: null } });
    expect(cancelRuntimeSession).toHaveBeenCalledWith("project.one", "run.gone", "Stopped from the extension.");
  });

  it("refuses a request that does not name the run, and stops nothing", async () => {
    const cancelRuntimeSession = vi.fn();
    const registry = registryWith({ cancelRuntimeSession });

    expect(await cancel(registry, { projectId: "project.one" })).toEqual({ ok: false, error: "Stopping a run needs its project and run IDs." });
    expect(await cancel(registry, { runId: "run.one" })).toMatchObject({ ok: false });
    expect(await cancel(registry, undefined)).toMatchObject({ ok: false });
    expect(cancelRuntimeSession).not.toHaveBeenCalled();
  });

  it("requires runtime.control, as starting a run does", async () => {
    const cancelRuntimeSession = vi.fn();
    const reader: ProgramApiActor = { ...actor, permissions: ["programs.read"] };
    const response = await cancel(registryWith({ cancelRuntimeSession }), { projectId: "project.one", runId: "run.one" }, reader);

    expect(response).toMatchObject({ ok: false, errorCode: "authorization.forbidden" });
    expect(cancelRuntimeSession).not.toHaveBeenCalled();
  });

  it("stops a queued run end to end, and stopping it again returns it as it ended", async () => {
    const { service, cleanup } = await createCacheApiTestService();
    cleanups.push(cleanup);
    const project = await service.createProject({ name: "Stop Endpoint" });
    const flow = await createRunnableCanonicalFlow(service, project.id, { flowId: "flow.stop-endpoint" });
    const registry = registryWith(service);
    const started = await registry.call<unknown, { runtimeSession: { runId: string; status: string } }>({
      programId: "automation-studio",
      endpoint: AUTOMATION_STUDIO_ENDPOINTS.startRuntimeSession,
      scope: {},
      actor,
      payload: { projectId: project.id, flowId: flow.flowId }
    });
    const runId = started.payload?.runtimeSession.runId ?? "";

    const stopped = await cancel(registry, { projectId: project.id, runId, reason: "Stopped from the panel." });
    const again = await cancel(registry, { projectId: project.id, runId });

    expect(stopped).toMatchObject({ ok: true, payload: { runtimeSession: { runId, status: "cancelled", metadata: { cancellation: { reason: "Stopped from the panel." } } } } });
    expect(again).toMatchObject({ ok: true, payload: { runtimeSession: { runId, status: "cancelled" } } });
    expect((await service.getRuntimeSession(project.id, runId))?.status).toBe("cancelled");
  });
});
