// The service wiring of two runtime-session modules: the sweep that ends the
// runs a dead process left `running` or `queued` (`service/runtime-session/orphaned-run-sweep.ts`),
// and the recorder that puts a late action result on its run's detail
// (`service/runtime-session/late-action-result.ts`), fed by the gateway.

import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { CLIENT_GATEWAY_PROTOCOL_VERSION, ClientGatewayService } from "../../../../../../client-gateway/index.ts";
import type { AutomationStudioRuntimeSession } from "../../../../model/index.ts";
import { AutomationStudioService } from "../../../index.ts";
import { AutomationStudioProjectPaths } from "../../../service/paths/index.ts";
import { admitAutomationStudioRuntimeSession, writeAutomationStudioRuntimeSessionFiles } from "../../../service/runtime-session/index.ts";
import { createRunnableCanonicalFlow } from "../../service-fixtures.ts";

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup();
});

async function dataDirectory(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "fluxiq-orphaned-run-"));
  cleanups.push(async () => await rm(root, { recursive: true, force: true }));
  return path.join(root, ".fluxiq", "data");
}

function open(dataDir: string): AutomationStudioService {
  const service = new AutomationStudioService({ dataDir, seedFixture: false });
  cleanups.unshift(async () => await service.close());
  return service;
}

/** Writes a session as the process that ran it last left it, straight to its files. */
async function leave(dataDir: string, projectId: string, session: AutomationStudioRuntimeSession): Promise<void> {
  const projectPaths = new AutomationStudioProjectPaths(path.join(dataDir, "programs", "automation-studio", "projects"));
  await writeAutomationStudioRuntimeSessionFiles({ projects: { ensureProjectStructure: async () => undefined }, projectPaths }, projectId, session);
}

/** Writes a session the way a running run does -- session files, summary and detail -- through the service that ran it. */
async function writeAsRunning(service: AutomationStudioService, projectId: string, session: AutomationStudioRuntimeSession): Promise<void> {
  await (service as unknown as { writeRuntimeSession(projectId: string, session: AutomationStudioRuntimeSession): Promise<void> }).writeRuntimeSession(projectId, session);
}

async function queuedRun(service: AutomationStudioService, flowId: string): Promise<{ projectId: string; session: AutomationStudioRuntimeSession }> {
  const project = await service.createProject({ name: `Project ${flowId}` });
  const flow = await createRunnableCanonicalFlow(service, project.id, { flowId });
  return { projectId: project.id, session: await service.startRuntimeSession({ projectId: project.id, flowId: flow.flowId }) };
}

describe("after a restart", () => {
  it("a run the dead process left running is ended interrupted, its last lasting act unknown, on the session and the run detail; one this process started is left running", async () => {
    const dataDir = await dataDirectory();
    const before = open(dataDir);
    const { projectId, session } = await queuedRun(before, "flow.orphan");
    const ours = await before.startRuntimeSession({ projectId, flowId: session.flowId });
    await before.close();
    await leave(dataDir, projectId, { ...session, status: "running", startedAt: 1_000, queuedAt: 1_000 });
    await leave(dataDir, projectId, { ...ours, status: "running", startedAt: Date.now() });

    const after = open(dataDir);
    const sessions = await after.listRuntimeSessions(projectId);

    const orphan = sessions.find((item) => item.runId === session.runId);
    expect(orphan).toMatchObject({ status: "interrupted", metadata: { interruption: { state: "interrupted", reason: "process_ended", sessionStatus: "running", lastingAct: "unknown" } } });
    expect(orphan?.trace?.message).toContain("interrupted");
    expect(sessions.find((item) => item.runId === ours.runId)?.status, "a run this process started is never swept").toBe("running");
    const detail = await after.getFlowRunDetail(projectId, session.runId);
    expect(detail).toMatchObject({ summary: { status: "interrupted" }, metadata: { interruption: { state: "interrupted", lastingAct: "unknown" } } });
  });

  it("a run the dead process left queued is ended interrupted and no longer holds the project's next adaptive run off; one queued here still does", async () => {
    const dataDir = await dataDirectory();
    const before = open(dataDir);
    const { projectId, session } = await queuedRun(before, "flow.queued");
    await before.close();
    const adaptive = { ...(session.metadata ?? {}), adaptiveRuntime: true };
    await leave(dataDir, projectId, { ...session, status: "queued", queuedAt: 1_000, metadata: adaptive });

    const after = open(dataDir);
    const admit = () => admitAutomationStudioRuntimeSession({ admissions: new Set(), listRuntimeSessions: (id) => after.listRuntimeSessions(id), startRuntimeSession: async () => ({ ...session, runId: "run.next" }) }, projectId, true);
    await expect(admit()).resolves.toMatchObject({ runId: "run.next" });

    const swept = await after.getRuntimeSession(projectId, session.runId);
    expect(swept).toMatchObject({ status: "interrupted", metadata: { interruption: { state: "interrupted", reason: "process_ended", sessionStatus: "queued", lastingAct: "none" } } });
    expect(swept?.trace?.message).toContain("before it started");
    await expect(after.getFlowRunDetail(projectId, session.runId)).resolves.toMatchObject({ summary: { status: "interrupted" }, metadata: { interruption: { sessionStatus: "queued", lastingAct: "none" } } });

    const queuedHere = await after.startRuntimeSession({ projectId, flowId: session.flowId });
    await writeAsRunning(after, projectId, { ...queuedHere, metadata: { ...(queuedHere.metadata ?? {}), adaptiveRuntime: true } });
    await expect(admit()).rejects.toThrow("Only one adaptive runtime run can be active per project.");
  });

  it("a run ended interrupted is never run again under its id", async () => {
    const dataDir = await dataDirectory();
    const before = open(dataDir);
    const { projectId, session } = await queuedRun(before, "flow.not-again");
    await before.close();
    await leave(dataDir, projectId, { ...session, status: "running", startedAt: 1_000, queuedAt: 1_000 });

    const after = open(dataDir);
    const again = await after.runRuntimeSession({ projectId, flowId: session.flowId, runId: session.runId });
    expect(again).toMatchObject({ runId: session.runId, status: "interrupted" });
    await expect(after.getRuntimeSession(projectId, session.runId)).resolves.toMatchObject({ status: "interrupted" });
  });

  it("the run list shows the orphan ended, not running", async () => {
    const dataDir = await dataDirectory();
    const before = open(dataDir);
    const { projectId, session } = await queuedRun(before, "flow.listed");
    await writeAsRunning(before, projectId, { ...session, status: "running", startedAt: 1_000, queuedAt: 1_000 });
    await before.close();

    const page = await open(dataDir).listRuntimeSessionSummaries(projectId);
    expect(page.runs.find((run) => run.runId === session.runId)?.status).toBe("interrupted");
  });
});

describe("a late action result", () => {
  it("reaches its run's detail from the gateway, and the caller keeps the outcome it was given", async () => {
    const dataDir = await dataDirectory();
    const service = open(dataDir);
    const { projectId, session } = await queuedRun(service, "flow.late");
    const gateway = new ClientGatewayService({ commandTimeoutMs: 20, commandOwner: () => ({ projectId, runId: session.runId }) });
    const recorded: Promise<boolean>[] = [];
    gateway.onLateActionResult((late) => { recorded.push(service.lateActionResults.record(late)); });
    const client = gateway.connect({ socket: { send: () => undefined } });
    await gateway.receive(client.sessionId, { id: "hello", type: "client.hello", protocolVersion: CLIENT_GATEWAY_PROTOCOL_VERSION, timestamp: Date.now(), payload: { clientId: "extension.late", clientType: "extension", name: "Extension" } });
    const pairing = gateway.snapshot().pairings.find((item) => item.requestedBySessionId === client.sessionId);
    await gateway.approvePairing(pairing?.pairingCode ?? "", { approvedByUserId: "user.late" });

    const response = gateway.executeAction(client.sessionId, { actionType: "example.press" });
    await expect(response.result).resolves.toMatchObject({ status: "timed_out" });
    await gateway.receive(client.sessionId, { id: "late", type: "client.action_result", protocolVersion: CLIENT_GATEWAY_PROTOCOL_VERSION, timestamp: Date.now(), payload: { commandId: response.commandId, status: "interrupted", message: "words from the page", failure: { category: "ambiguous_or_unknown", code: "web.action.unknown", retryable: false, effect: "ambiguous" } } });

    expect(await Promise.all(recorded)).toEqual([true]);
    await expect(response.result).resolves.toMatchObject({ status: "timed_out" });
    const detail = await service.getFlowRunDetail(projectId, session.runId);
    expect(detail?.metadata?.lateActionResults).toEqual([expect.objectContaining({ commandId: response.commandId, closedAs: "timed_out", status: "unknown", reportedStatus: "interrupted", interrupted: true, effect: "ambiguous" })]);
    expect(JSON.stringify(detail)).not.toContain("words from the page");
    await gateway.close();
  });
});
