import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import { ProgramJsonStore } from "../../../../../_shared/storage.ts";
import { AutomationStudioProjectRuntimeStreamStore } from "../../../../storage/index.ts";
import { AutomationStudioService } from "../../../service.ts";
import { createRunnableCanonicalFlow } from "../../../tests/service-fixtures.ts";

// Reading a run's detail: the typed runtime store first, then the legacy JSON
// detail, then a rebuild from the run's session for a run neither store holds.
// A typed store that is configured but cannot be opened or read is an error.
// Read as "not held", it sent the read on to the rebuild, which saved the bare
// session projection over a run that was stored all along.

let tempRoot: string;
const services = new Set<AutomationStudioService>();

function createService(): AutomationStudioService {
  const service = new AutomationStudioService({ dataDir: tempRoot, seedFixture: false });
  services.add(service);
  return service;
}

beforeEach(async () => {
  tempRoot = await mkdtemp(path.join(os.tmpdir(), "fluxiq-run-detail-read-"));
});

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all([...services].map((service) => service.close()));
  services.clear();
  await rm(tempRoot, { recursive: true, force: true, maxRetries: 10, retryDelay: 25 });
});

async function completedRun(service: AutomationStudioService): Promise<{ projectId: string; runId: string }> {
  const project = await service.createProject({ name: "Run detail reads" });
  const flow = await createRunnableCanonicalFlow(service, project.id, { flowId: "flow.run-detail-reads" });
  const run = await service.runRuntimeSession({ projectId: project.id, flowId: flow.flowId });
  expect(run.status).toBe("succeeded");
  const stored = await service.getFlowRunDetail(project.id, run.runId);
  expect(stored?.summary.runId).toBe(run.runId);
  expect(stored?.metadata?.partialWriteRecovery).toBeUndefined();
  return { projectId: project.id, runId: run.runId };
}

describe("reading a run's detail", () => {
  it("fails when the typed store cannot read the run, and writes nothing over it", async () => {
    const service = createService();
    const { projectId, runId } = await completedRun(service);
    vi.spyOn(AutomationStudioProjectRuntimeStreamStore.prototype, "getRunDetail").mockRejectedValueOnce(new Error("database disk image is malformed"));

    await expect(service.getFlowRunDetail(projectId, runId)).rejects.toThrow("database disk image is malformed");

    vi.restoreAllMocks();
    const after = await service.getFlowRunDetail(projectId, runId);
    expect(after?.summary.status).toBe("succeeded");
    expect(after?.metadata?.partialWriteRecovery).toBeUndefined();
  });

  it("fails when the configured typed store cannot be opened, and writes nothing over the run", async () => {
    const service = createService();
    const { projectId, runId } = await completedRun(service);
    vi.spyOn(AutomationStudioProjectRuntimeStreamStore, "open").mockRejectedValueOnce(new Error("database is locked"));

    await expect(service.getFlowRunDetail(projectId, runId)).rejects.toThrow("database is locked");

    vi.restoreAllMocks();
    expect((await service.getFlowRunDetail(projectId, runId))?.metadata?.partialWriteRecovery).toBeUndefined();
  });

  it("still rebuilds, and keeps, a run neither store holds from its session", async () => {
    const service = createService();
    const { projectId, runId } = await completedRun(service);
    const session = await service.getRuntimeSession(projectId, runId);
    const orphanRunId = `${runId}.orphan`;
    // A session whose detail was never saved, as a crash between the two writes leaves it.
    const sessionFile = path.join(tempRoot, "programs", "automation-studio", "projects", projectId, "runtime", "sessions", `${orphanRunId}.json`);
    await new ProgramJsonStore<JsonObject>(sessionFile, () => ({})).write({ session: { ...session!, runId: orphanRunId } as unknown as JsonObject });

    const rebuilt = await service.getFlowRunDetail(projectId, orphanRunId);
    expect(rebuilt?.summary).toMatchObject({ runId: orphanRunId, status: "succeeded" });
    expect(rebuilt?.metadata?.partialWriteRecovery).toMatchObject({ source: "runtime-session" });
    await expect(service.getFlowRunDetail(projectId, orphanRunId)).resolves.toMatchObject({ metadata: { partialWriteRecovery: { source: "runtime-session" } } });
  });

  it("reads nothing for a run that has no detail and no session", async () => {
    const service = createService();
    const { projectId } = await completedRun(service);

    await expect(service.getFlowRunDetail(projectId, "run.never-started")).resolves.toBeNull();
  });
});
