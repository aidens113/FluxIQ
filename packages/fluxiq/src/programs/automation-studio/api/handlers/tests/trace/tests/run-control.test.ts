// Run control arriving over HTTP is recorded into the trace of the episode it
// targets (traces and offline trials, P2; D1): stop, pause and resume into the
// run's open episode found by run id, and build cancellation into the
// outermost open episode of its project's Flow. Each is called from outside
// the episode's async context, so only the registry can route it. Nothing is
// recorded, and the request still takes effect, when no episode is open or no
// episodes are installed.

import { afterEach, describe, expect, it, vi } from "vitest";

import { GlobalProgramApiRegistry, type ProgramApiActor } from "../../../../../../_shared/api.ts";
import type { ClientGatewayTraceEvent } from "../../../../../../../client-gateway/index.ts";
import { AutomationStudioGatewayTraceInstallation } from "../../../../../runtime/gateway-trace/index.ts";
import { episode, newEpisodes, storedEvents, type EpisodesHarness } from "../../../../../runtime/gateway-trace/tests/episode-builders.ts";
import { AUTOMATION_STUDIO_ENDPOINTS } from "../../../../contracts.ts";
import { registerAutomationStudioApi } from "../../../index.ts";

const actor: ProgramApiActor = { sessionId: "session.trace", userId: "user.trace", roleId: "admin", permissions: ["programs.read", "runtime.control"] };

type Service = Parameters<typeof registerAutomationStudioApi>[1];

function registryWith(service: object): GlobalProgramApiRegistry {
  const registry = new GlobalProgramApiRegistry();
  registerAutomationStudioApi(registry, service as unknown as Service);
  return registry;
}

function call(registry: GlobalProgramApiRegistry, endpoint: string, payload: unknown) {
  return registry.call({ programId: "automation-studio", endpoint, scope: {}, actor, payload });
}

/** Work that stays open until `release` is called, so a request can arrive while the episode is open. */
function held(): { work: () => Promise<void>; release: () => void } {
  let release: () => void = () => {};
  const done = new Promise<void>((resolve) => { release = resolve; });
  return { work: () => done, release };
}

function controlEvents(events: readonly ClientGatewayTraceEvent[]): ClientGatewayTraceEvent[] {
  return events.filter((event) => event.messageType === "control.run_control");
}

function payloadOf(event: ClientGatewayTraceEvent | undefined): unknown {
  return event?.payload.encoding === "json" ? event.payload.value : undefined;
}

const uninstalls: Array<() => void> = [];

function installed(): EpisodesHarness {
  const harness = newEpisodes();
  uninstalls.push(AutomationStudioGatewayTraceInstallation.install(harness.episodes));
  return harness;
}

afterEach(() => {
  for (const uninstall of uninstalls.splice(0)) uninstall();
});

const service = () => ({
  cancelRuntimeSession: vi.fn(async () => null),
  getRuntimeSession: vi.fn(async () => null),
  instructionAuthority: { resume: vi.fn(async () => null) },
  buildCancellation: { cancel: vi.fn(() => true) }
});

describe("run control into the run's open trace", () => {
  it("records a stop, a pause and a resume into the run's episode, found by run id, before each takes effect", async () => {
    const { episodes, stores } = installed();
    const stub = service();
    const registry = registryWith(stub);
    const run = held();
    const running = episodes.run(episode({ projectId: "project-1", episodeId: "run-1" }), run.work);

    await call(registry, AUTOMATION_STUDIO_ENDPOINTS.pauseRuntimeSession, { projectId: "project-1", runId: "run-1", takeControl: true, reason: "Taking over" });
    await call(registry, AUTOMATION_STUDIO_ENDPOINTS.resumeRuntimeSession, { projectId: "project-1", runId: "run-1", afterManualAction: true, note: "Signed in" });
    await call(registry, AUTOMATION_STUDIO_ENDPOINTS.cancelRuntimeSession, { projectId: "project-1", runId: "run-1", reason: "Stopped" });
    run.release();
    await running;

    expect(stub.cancelRuntimeSession).toHaveBeenCalledWith("project-1", "run-1", "Stopped");
    expect(stub.instructionAuthority.resume).toHaveBeenCalledTimes(1);
    const events = controlEvents(await storedEvents(stores.get("project-1"), "trace-1"));
    expect(events.map(payloadOf)).toEqual([
      { action: "pause", holder: "person", reason: "Taking over", projectId: "project-1", runId: "run-1" },
      { action: "resume", afterManualAction: true, note: "Signed in", projectId: "project-1", runId: "run-1" },
      { action: "cancel", projectId: "project-1", runId: "run-1", reason: "Stopped" }
    ]);
    expect(events.every((event) => event.stream === "control" && event.kind === "control")).toBe(true);
  });

  it("records nothing for a run with no open episode, or one open in another project, and still acts", async () => {
    const { episodes, stores } = installed();
    const stub = service();
    const registry = registryWith(stub);
    const run = held();
    const running = episodes.run(episode({ projectId: "project-1", episodeId: "run-1" }), run.work);

    await call(registry, AUTOMATION_STUDIO_ENDPOINTS.cancelRuntimeSession, { projectId: "project-1", runId: "run-other" });
    await call(registry, AUTOMATION_STUDIO_ENDPOINTS.pauseRuntimeSession, { projectId: "project-2", runId: "run-1" });
    run.release();
    await running;

    expect(stub.cancelRuntimeSession).toHaveBeenCalledWith("project-1", "run-other", undefined);
    expect(controlEvents(await storedEvents(stores.get("project-1"), "trace-1"))).toEqual([]);
  });

  it("does nothing with no episodes installed, and the request still takes effect", async () => {
    const stub = service();
    const response = await call(registryWith(stub), AUTOMATION_STUDIO_ENDPOINTS.cancelRuntimeSession, { projectId: "project-1", runId: "run-1" });

    expect(response).toEqual({ ok: true, payload: { runtimeSession: null } });
    expect(stub.cancelRuntimeSession).toHaveBeenCalledTimes(1);
  });
});

describe("build cancellation into the Flow's outermost open episode", () => {
  it("records into the build, not the trial it is running", async () => {
    const { episodes, stores } = installed();
    const stub = service();
    const registry = registryWith(stub);
    const trial = held();
    let trialRunning: Promise<void> = Promise.resolve();
    const building = episodes.run(episode({ projectId: "project-1", episodeId: "build.1", activity: "exploration", flowId: "flow-1" }), async () => {
      trialRunning = episodes.run(episode({ projectId: "project-1", episodeId: "run-trial", activity: "test", flowId: "flow-1" }), trial.work);
      await trialRunning;
    });

    const response = await call(registry, AUTOMATION_STUDIO_ENDPOINTS.cancelFlowBootstrap, { projectId: "project-1", flowId: "flow-1" });
    trial.release();
    await building;

    expect(response).toEqual({ ok: true, payload: { projectId: "project-1", flowId: "flow-1", cancellationRequested: true } });
    expect(stub.buildCancellation.cancel).toHaveBeenCalledWith("project-1", "flow-1");
    const store = stores.get("project-1");
    expect(controlEvents(await storedEvents(store, "trace-1")).map(payloadOf)).toEqual([{ action: "cancel_build", projectId: "project-1", flowId: "flow-1" }]);
    expect(controlEvents(await storedEvents(store, "trace-2"))).toEqual([]);
  });

  it("records nothing when the Flow has no open episode, and still cancels", async () => {
    const { episodes, stores } = installed();
    const stub = service();
    const registry = registryWith(stub);
    const build = held();
    const building = episodes.run(episode({ projectId: "project-1", episodeId: "build.1", activity: "exploration", flowId: "flow-1" }), build.work);

    await call(registry, AUTOMATION_STUDIO_ENDPOINTS.cancelFlowBootstrap, { projectId: "project-1", flowId: "flow-2" });
    await call(registry, AUTOMATION_STUDIO_ENDPOINTS.cancelFlowBootstrap, { projectId: "project-2", flowId: "flow-1" });
    build.release();
    await building;

    expect(stub.buildCancellation.cancel).toHaveBeenCalledTimes(2);
    expect(controlEvents(await storedEvents(stores.get("project-1"), "trace-1"))).toEqual([]);
  });
});
