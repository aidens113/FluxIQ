import { describe, expect, it, vi } from "vitest";
import type { AutomationStudioFlowRunDetail, AutomationStudioRuntimeSession } from "../../../../model/index.ts";
import { AutomationStudioOrphanedRunSweep } from "../orphaned-run-sweep.ts";

const PROCESS_STARTED_AT = 10_000;
const projectId = "project.sweep";

function session(runId: string, fields: Partial<AutomationStudioRuntimeSession>): AutomationStudioRuntimeSession {
  return {
    schemaVersion: "0.1",
    runId,
    projectId,
    targetKind: "flow",
    targetId: "flow.sweep",
    flowId: "flow.sweep",
    status: "running",
    queuedAt: 1_000,
    startedAt: 1_000,
    flow: { flowId: "flow.sweep" } as AutomationStudioRuntimeSession["flow"],
    ...fields
  };
}

function harness(sessions: AutomationStudioRuntimeSession[], live: string[] = []) {
  const stored = new Map(sessions.map((item) => [item.runId, item]));
  const details: AutomationStudioFlowRunDetail[] = [];
  const ports = {
    read: vi.fn(async (_projectId: string, runId: string) => stored.get(runId) ?? null),
    list: vi.fn(async () => [...stored.values()]),
    write: vi.fn(async (_projectId: string, written: AutomationStudioRuntimeSession) => { stored.set(written.runId, written); }),
    saveFlowRunDetail: vi.fn(async (detail: AutomationStudioFlowRunDetail) => { details.push(detail); }),
    runsLive: (_projectId: string, runId: string) => live.includes(runId),
    now: () => 50_000,
    processStartedAt: PROCESS_STARTED_AT
  };
  return { stored, details, ports, sweep: new AutomationStudioOrphanedRunSweep(ports) };
}

describe("ending the runs a dead process left running", () => {
  it("ends a run an earlier process left running as interrupted, its last lasting act unknown, on the session and the run detail", async () => {
    const orphan = session("run.orphan", { trace: { status: "running", startedAt: 1_000, attempts: [], values: {}, effects: [], currentNodeId: "node.press" } as unknown as NonNullable<AutomationStudioRuntimeSession["trace"]> });
    const { stored, details, sweep } = harness([orphan]);

    const read = await sweep.sessionPorts.read(projectId, "run.orphan");

    const interruption = { state: "interrupted", reason: "process_ended", at: 50_000, sessionStatus: "running", lastingAct: "unknown", lastNodeId: "node.press" };
    expect(read).toMatchObject({ status: "interrupted", finishedAt: 50_000, metadata: { interruption }, trace: { status: "failed", finishedAt: 50_000, message: expect.stringContaining("interrupted") } });
    expect(stored.get("run.orphan")).toEqual(read);
    expect(details).toHaveLength(1);
    expect(details[0]).toMatchObject({ summary: { runId: "run.orphan", projectId, status: "interrupted", finishedAt: 50_000 }, metadata: { interruption } });
  });

  it("ends a run an earlier process left queued as interrupted, which never acted", async () => {
    const { startedAt: _neverStarted, ...queued } = session("run.queued", { status: "queued" });
    const { stored, details, sweep } = harness([queued]);

    const read = await sweep.sessionPorts.read(projectId, "run.queued");

    const interruption = { state: "interrupted", reason: "process_ended", at: 50_000, sessionStatus: "queued", lastingAct: "none" };
    expect(read).toMatchObject({ status: "interrupted", finishedAt: 50_000, metadata: { interruption }, trace: { status: "failed", startedAt: 1_000, message: expect.stringContaining("before it started") } });
    expect(read?.metadata?.interruption).toEqual(interruption);
    expect(stored.get("run.queued")).toEqual(read);
    expect(details[0]).toMatchObject({ summary: { runId: "run.queued", status: "interrupted" }, metadata: { interruption } });
  });

  it("never touches a run this process started or queued, a run a live executor owns, or a run that is not running or queued", async () => {
    const thisProcess = session("run.this-process", { queuedAt: PROCESS_STARTED_AT, startedAt: PROCESS_STARTED_AT + 5 });
    const { startedAt: _notYet, ...queuedHere } = session("run.queued-here", { status: "queued", queuedAt: PROCESS_STARTED_AT + 1 });
    const resumedLive = session("run.resumed-live", {});
    const parked = session("run.parked", { status: "waiting" });
    const ended = session("run.ended", { status: "succeeded", finishedAt: 2_000 });
    const failed = session("run.failed", { status: "failed", finishedAt: 2_000 });
    const { ports, details, sweep } = harness([thisProcess, queuedHere, resumedLive, parked, ended, failed], ["run.resumed-live"]);

    const listed = await sweep.sessionPorts.list(projectId);

    expect(listed.map((item) => [item.runId, item.status])).toEqual([
      ["run.this-process", "running"],
      ["run.queued-here", "queued"],
      ["run.resumed-live", "running"],
      ["run.parked", "waiting"],
      ["run.ended", "succeeded"],
      ["run.failed", "failed"]
    ]);
    expect(ports.write).not.toHaveBeenCalled();
    expect(details).toEqual([]);
  });

  it("sweeps a project once for the life of the service, before its first read", async () => {
    const { ports, sweep } = harness([session("run.orphan", {})]);
    await sweep.sessionPorts.read(projectId, "run.orphan");
    await sweep.sessionPorts.list(projectId);
    await sweep.sessionPorts.read(projectId, "run.orphan");
    expect(ports.list).toHaveBeenCalledTimes(2);
    expect(ports.write).toHaveBeenCalledTimes(1);
  });

  it("lets the read go on when the sweep fails, keeps why, and tries again on the next read", async () => {
    const { ports, sweep, stored } = harness([session("run.orphan", {})]);
    ports.write.mockRejectedValueOnce(new Error("disk full"));

    await expect(sweep.sessionPorts.read(projectId, "run.orphan")).resolves.toMatchObject({ status: "running" });
    expect(sweep.lastFailure).toEqual(new Error("disk full"));
    await expect(sweep.sessionPorts.read(projectId, "run.orphan")).resolves.toMatchObject({ status: "interrupted" });
    expect(stored.get("run.orphan")?.metadata).toMatchObject({ interruption: { lastingAct: "unknown" } });
  });
});
