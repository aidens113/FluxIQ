import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AutomationStudioProjectDatabasePool, type AutomationStudioProjectDatabaseLease } from "../../../../storage/index.ts";
import { AutomationStudioService, type AutomationStudioServiceOptions } from "../../../service.ts";
import { adaptiveTrainingMetadata, createRunnableCanonicalFlow } from "../../service-fixtures.ts";

// A run whose start throws must not stay active. A `queued` or `running`
// session counts as an active adaptive run, which holds the project's next
// adaptive run off until somebody cancels it. A run a person asked the model
// into fails the same way, with nothing to revoke. The reads a run's start makes are strict: a
// failed read refuses the run rather than being taken as "nothing there".

let tempRoot: string;
const services = new Set<AutomationStudioService>();

function createService(options: Omit<AutomationStudioServiceOptions, "dataDir"> = {}): AutomationStudioService {
  const service = new AutomationStudioService({ dataDir: tempRoot, seedFixture: false, ...options });
  services.add(service);
  return service;
}

beforeEach(async () => {
  tempRoot = await mkdtemp(path.join(os.tmpdir(), "fluxiq-failed-start-"));
});

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all([...services].map((service) => service.close()));
  services.clear();
  await rm(tempRoot, { recursive: true, force: true, maxRetries: 10, retryDelay: 25 });
});

async function adaptiveFlow(service: AutomationStudioService): Promise<{ projectId: string; flowId: string }> {
  const project = await service.createProject({ name: "Failed start" });
  const flow = await createRunnableCanonicalFlow(service, project.id, { flowId: "flow.failed-start", metadata: adaptiveTrainingMetadata() });
  return { projectId: project.id, flowId: flow.flowId };
}

const llmExecution = { actorUserId: "user.test", actorSessionId: "session.test", intent: "diagnosis_only" as const };

describe("a run whose start throws", () => {
  it("is ended as failed with its reason, and does not hold off the next adaptive run", async () => {
    const service = createService();
    const { projectId, flowId } = await adaptiveFlow(service);
    vi.spyOn(service, "listFlowRunSummaries").mockRejectedValueOnce(new Error("database is locked"));

    await expect(service.runRuntimeSession({ projectId, flowId })).rejects.toThrow("database is locked");

    const [failed, ...others] = await service.listRuntimeSessions(projectId);
    expect(others).toEqual([]);
    expect(failed).toMatchObject({
      status: "failed",
      finishedAt: expect.any(Number),
      trace: { status: "failed", message: "database is locked", attempts: [] },
      metadata: { adaptiveRuntime: true, runFailure: { sessionStatus: "queued", reason: "database is locked" } }
    });
    await expect(service.runRuntimeSession({ projectId, flowId })).resolves.toMatchObject({ status: "succeeded" });
  });

  it("is ended as failed when it throws after it was marked running", async () => {
    const service = createService();
    const { projectId, flowId } = await adaptiveFlow(service);
    vi.spyOn(service, "getFlowRouter").mockRejectedValueOnce(new Error("router index unreadable"));

    await expect(service.runRuntimeSession({ projectId, flowId })).rejects.toThrow("router index unreadable");

    await expect(service.listRuntimeSessions(projectId)).resolves.toEqual([expect.objectContaining({
      status: "failed",
      trace: expect.objectContaining({ status: "failed", message: "router index unreadable" }),
      metadata: expect.objectContaining({ runFailure: expect.objectContaining({ sessionStatus: "running" }) })
    })]);
    await expect(service.runRuntimeSession({ projectId, flowId })).resolves.toMatchObject({ status: "succeeded" });
  });

  // The run holds its project database for its own duration (one lease
  // across the operation). A start that throws, before or after the session
  // is marked running, must hand that lease back like any other exit.
  it.each([
    ["before it is marked running", "listFlowRunSummaries", "database is locked"],
    ["after it was marked running", "getFlowRouter", "router index unreadable"]
  ] as const)("releases every project database lease it took when it throws %s", async (_when, method, message) => {
    const service = createService();
    const { projectId, flowId } = await adaptiveFlow(service);
    const outstanding = leasesOutstanding();
    vi.spyOn(service, method).mockRejectedValueOnce(new Error(message));

    await expect(service.runRuntimeSession({ projectId, flowId })).rejects.toThrow(message);

    expect(outstanding.taken).toBeGreaterThan(0);
    expect(outstanding.count()).toBe(0);
  });

  it("keeps a cancellation that was recorded before it threw", async () => {
    const service = createService();
    const { projectId, flowId } = await adaptiveFlow(service);
    vi.spyOn(service, "getFlowRouter").mockImplementationOnce(async () => {
      const [running] = await service.listRuntimeSessions(projectId);
      await service.cancelRuntimeSession(projectId, running!.runId, "Stopped by the operator.");
      throw new Error("late failure");
    });

    await expect(service.runRuntimeSession({ projectId, flowId })).rejects.toThrow("late failure");

    const [cancelled] = await service.listRuntimeSessions(projectId);
    expect(cancelled).toMatchObject({ status: "cancelled", metadata: { cancellation: { reason: "Stopped by the operator." } } });
    expect(cancelled?.metadata).not.toHaveProperty("runFailure");
  });

  it("ends a model run as failed too, with nothing issued to revoke", async () => {
    const service = createService();
    const { projectId, flowId } = await adaptiveFlow(service);
    vi.spyOn(service, "listFlowRunSummaries").mockRejectedValueOnce(new Error("database is locked"));

    await expect(service.runRuntimeSession({ projectId, flowId, llmExecution })).rejects.toThrow("database is locked");

    await expect(service.listRuntimeSessions(projectId)).resolves.toEqual([expect.objectContaining({ status: "failed" })]);
  });

  it("refuses a model run another adaptive run keeps from being admitted", async () => {
    const service = createService();
    const { projectId, flowId } = await adaptiveFlow(service);
    await service.startRuntimeSession({ projectId, flowId, metadata: { adaptiveRuntime: true } });

    await expect(service.runRuntimeSession({ projectId, flowId, llmExecution })).rejects.toThrow("Only one adaptive runtime run can be active per project.");
  });
});

describe("the reads a run's start makes", () => {
  it("refuses an idempotent run when the session listing cannot be read, instead of starting a duplicate", async () => {
    const service = createService();
    const { projectId, flowId } = await adaptiveFlow(service);
    const first = await service.runRuntimeSession({ projectId, flowId, idempotencyKey: "key.one" });
    await expect(service.runRuntimeSession({ projectId, flowId, idempotencyKey: "key.one" })).resolves.toMatchObject({ runId: first.runId });
    vi.spyOn(service, "listRuntimeSessions").mockRejectedValueOnce(new Error("sessions unreadable"));

    await expect(service.runRuntimeSession({ projectId, flowId, idempotencyKey: "key.one" })).rejects.toThrow("sessions unreadable");

    await expect(service.listRuntimeSessions(projectId)).resolves.toEqual([expect.objectContaining({ runId: first.runId })]);
  });

  it("refuses an adaptive run when the admission check cannot read the sessions, instead of admitting it", async () => {
    const service = createService();
    const { projectId, flowId } = await adaptiveFlow(service);
    vi.spyOn(service, "listRuntimeSessions").mockRejectedValueOnce(new Error("sessions unreadable"));

    await expect(service.runRuntimeSession({ projectId, flowId })).rejects.toThrow("sessions unreadable");

    await expect(service.listRuntimeSessions(projectId)).resolves.toEqual([]);
  });

  it("fails a canonical run whose Flow cannot be read again, instead of running it without its checks", async () => {
    const service = createService();
    const { projectId, flowId } = await adaptiveFlow(service);
    const getFlow = service.getFlow.bind(service);
    // The start's own read is let through; the read once the session exists fails.
    vi.spyOn(service, "getFlow").mockImplementation(async (readProjectId, readFlowId) => {
      if ((await service.listRuntimeSessions(readProjectId)).length) throw new Error("flow document unreadable");
      return await getFlow(readProjectId, readFlowId);
    });

    await expect(service.runRuntimeSession({ projectId, flowId })).rejects.toThrow("flow document unreadable");

    await expect(service.listRuntimeSessions(projectId)).resolves.toEqual([expect.objectContaining({
      status: "failed",
      metadata: expect.objectContaining({ canonicalFlow: true, runFailure: expect.objectContaining({ reason: "flow document unreadable" }) })
    })]);
  });
});

/** Counts the project database leases taken from now on that have not been released. */
function leasesOutstanding(): { taken: number; count(): number } {
  const open = new Set<AutomationStudioProjectDatabaseLease>();
  const state = { taken: 0, count: () => open.size };
  const acquire = AutomationStudioProjectDatabasePool.prototype.acquire;
  vi.spyOn(AutomationStudioProjectDatabasePool.prototype, "acquire").mockImplementation(async function (this: AutomationStudioProjectDatabasePool, projectId: string) {
    const lease = await acquire.call(this, projectId);
    state.taken += 1;
    open.add(lease);
    return { ...lease, release: async () => { open.delete(lease); await lease.release(); } };
  });
  return state;
}
