// The host's wiring of late action results (C8): the gateway is told which run
// a command is sent from (`commandOwner`, read from the run's activity scope),
// and its late results go to Automation Studio's recorder. A result for an
// ordinary command that comes after Core stopped waiting is put on its run --
// on the run detail and the run's event log -- and never applied: the caller
// keeps the outcome it was given and the run itself is unchanged.

import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CLIENT_GATEWAY_PROTOCOL_VERSION } from "../../../client-gateway/index.ts";
import { runWithAutomationStudioActivity } from "../../automation-studio/index.ts";
import { createRunnableCanonicalFlow } from "../../automation-studio/runtime/tests/service-fixtures.ts";
import { createGlobalProgramRuntime } from "../../index.ts";

type Runtime = ReturnType<typeof createGlobalProgramRuntime>;

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  vi.useRealTimers();
  for (const cleanup of cleanups.splice(0)) await cleanup();
});

async function host(): Promise<Runtime> {
  const root = await mkdtemp(path.join(os.tmpdir(), "fluxiq-late-result-wiring-"));
  cleanups.push(async () => await rm(root, { recursive: true, force: true }));
  const fluxiq = path.join(root, ".fluxiq");
  const domains = path.join(fluxiq, "domains");
  const runtime = createGlobalProgramRuntime({
    root, fluxiq, config: path.join(fluxiq, "config"), data: path.join(fluxiq, "data"), databases: path.join(fluxiq, "databases"),
    inputs: path.join(fluxiq, "inputs"), outputs: path.join(fluxiq, "outputs"), streams: path.join(fluxiq, "streams"),
    domains, domainPrograms: path.join(domains, "programs"), domainInputs: path.join(domains, "inputs"), domainOutputs: path.join(domains, "outputs"),
    domainConfigs: path.join(domains, "configs"), domainData: path.join(domains, "data"), domainDatabases: path.join(domains, "databases"),
    recordings: path.join(fluxiq, "recordings"), policies: path.join(fluxiq, "policies"), logs: path.join(fluxiq, "logs"), temp: path.join(fluxiq, "tmp")
  } as Parameters<typeof createGlobalProgramRuntime>[0], { modelProvidersEnabled: false });
  cleanups.unshift(async () => {
    await runtime.clientGateway.close();
    await runtime.automationStudio.close();
    runtime.secretKeys.close();
  });
  return runtime;
}

async function pairedClient(runtime: Runtime): Promise<string> {
  const gateway = runtime.clientGateway;
  const client = gateway.connect({ socket: { send: () => undefined } });
  await gateway.receive(client.sessionId, { id: "hello", type: "client.hello", protocolVersion: CLIENT_GATEWAY_PROTOCOL_VERSION, timestamp: Date.now(), payload: { clientId: "extension.late-wiring", clientType: "extension", name: "Extension" } });
  const pairing = gateway.snapshot().pairings.find((item) => item.requestedBySessionId === client.sessionId);
  await gateway.approvePairing(pairing?.pairingCode ?? "", { approvedByUserId: "user.late-wiring" });
  return client.sessionId;
}

/** Sends an ordinary command and lets Core's wait for it run out. */
async function timedOut(runtime: Runtime, sessionId: string, send: <T>(fn: () => T) => T) {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  const response = send(() => runtime.clientGateway.executeAction(sessionId, { actionType: "example.press" }));
  await vi.advanceTimersByTimeAsync(31_000);
  vi.useRealTimers();
  await expect(response.result).resolves.toMatchObject({ status: "timed_out" });
  return response;
}

async function answerLate(runtime: Runtime, sessionId: string, commandId: string, id: string): Promise<void> {
  await runtime.clientGateway.receive(sessionId, { id, type: "client.action_result", protocolVersion: CLIENT_GATEWAY_PROTOCOL_VERSION, timestamp: Date.now(), payload: { commandId, status: "interrupted", message: "words from the page", failure: { category: "ambiguous_or_unknown", code: "web.action.unknown", retryable: false, effect: "ambiguous" } } });
}

describe("a late result for an ordinary command, through the host", () => {
  it("lands on the run that sent the command, on its detail and its event log, and is never applied", async () => {
    const runtime = await host();
    const studio = runtime.automationStudio;
    const project = await studio.createProject({ name: "Late wiring" });
    const flow = await createRunnableCanonicalFlow(studio, project.id, { flowId: "flow.late-wiring" });
    const session = await studio.startRuntimeSession({ projectId: project.id, flowId: flow.flowId });
    const before = await studio.getFlowRunDetail(project.id, session.runId);
    const sessionId = await pairedClient(runtime);

    const response = await timedOut(runtime, sessionId, (fn) => runWithAutomationStudioActivity({ kind: "run", id: session.runId, projectId: project.id }, fn));
    await answerLate(runtime, sessionId, response.commandId, "late");

    // Never applied: the caller keeps the outcome it was given, and the run is as it was.
    await expect(response.result).resolves.toMatchObject({ status: "timed_out" });
    await expect(studio.getRuntimeSession(project.id, session.runId)).resolves.toMatchObject({ status: session.status });
    const detail = await studio.getFlowRunDetail(project.id, session.runId);
    expect(detail?.actionAttempts ?? []).toEqual(before?.actionAttempts ?? []);
    expect(detail?.summary.status).toBe(before?.summary.status);
    // Put on its run.
    expect(detail?.metadata?.lateActionResults).toEqual([expect.objectContaining({ commandId: response.commandId, durable: false, closedAs: "timed_out", status: "unknown", reportedStatus: "interrupted", interrupted: true, effect: "ambiguous" })]);
    const log = await studio.listFlowRunEvents({ projectId: project.id, runId: session.runId });
    expect(log.events.filter((event) => event.eventKind === "late_action_result")).toEqual([expect.objectContaining({ eventId: `late_action_result:${response.commandId}:interrupted`, status: "unknown", entityId: response.commandId })]);
    expect(JSON.stringify(detail)).not.toContain("words from the page");
  });

  it("is attributed to no run when the command was sent outside one, and still never applied", async () => {
    const runtime = await host();
    const studio = runtime.automationStudio;
    const project = await studio.createProject({ name: "Late unowned" });
    const flow = await createRunnableCanonicalFlow(studio, project.id, { flowId: "flow.late-unowned" });
    const session = await studio.startRuntimeSession({ projectId: project.id, flowId: flow.flowId });
    const sessionId = await pairedClient(runtime);

    const response = await timedOut(runtime, sessionId, (fn) => fn());
    await answerLate(runtime, sessionId, response.commandId, "late.unowned");

    await expect(response.result).resolves.toMatchObject({ status: "timed_out" });
    const detail = await studio.getFlowRunDetail(project.id, session.runId);
    expect(detail?.metadata?.lateActionResults).toBeUndefined();
  });
});
