// @fluxiq-test-group real-sql
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AutomationStudioFlowRunDetail } from "../../../../../../flows/authoring/model/index.ts";
import { AutomationStudioProjectDatabasePool, AutomationStudioProjectRuntimeStreamStore, AutomationStudioProjectStoreUnavailableError } from "../../../../../persistence/automation/index.ts";
import { AutomationStudioServiceIndexes } from "../../../indexes/index.ts";
import { AutomationStudioFlowPaths, AutomationStudioProjectPaths } from "../../../paths/index.ts";
import { AutomationStudioProjectStore } from "../../../projects/index.ts";
import { AutomationStudioRunDetailWriter } from "../index.ts";

let rootDir = "";
const pools: AutomationStudioProjectDatabasePool[] = [];
beforeEach(async () => { rootDir = await mkdtemp(path.join(os.tmpdir(), "fluxiq-run-writer-")); });
afterEach(async () => {
  vi.restoreAllMocks();
  for (const pool of pools.splice(0)) await pool.closeAll();
  await rm(rootDir, { recursive: true, force: true });
});

const detail = (): AutomationStudioFlowRunDetail => ({
  schemaVersion: "0.1",
  summary: { schemaVersion: "0.1", runId: "run.one", projectId: "project.one", flowId: "flow.one", status: "running", startedAt: 1, updatedAt: 1, routeDecisionCount: 0, subflowEntryCount: 0, actionAttemptCount: 0, interventionCount: 0, adaptationCount: 0 },
  routeDecisions: [], subflows: [], actionAttempts: [], interventions: [], adaptationIds: [], changeProposalIds: []
});

async function writer(typed: boolean) {
  const paths = new AutomationStudioProjectPaths(path.join(rootDir, "projects"));
  const flowPaths = new AutomationStudioFlowPaths(paths);
  const projects = new AutomationStudioProjectStore(paths);
  await projects.writeProjectIndex(() => ({ categories: [], projects: [{ id: "project.one", name: "One", description: "", createdAt: 1, updatedAt: 1 }] }));
  const summaries = { writeJsonLines: vi.fn(async () => {}), writeFlowRunSummary: vi.fn(async () => {}), tryWithRuntimeStreamStore: async () => null };
  const pool = typed ? new AutomationStudioProjectDatabasePool({ rootDir }) : undefined;
  if (pool) pools.push(pool);
  return { file: flowPaths.flowRunDetailFile("project.one", "run.one"), summaries, save: new AutomationStudioRunDetailWriter(paths, flowPaths, projects, new AutomationStudioServiceIndexes(paths, projects), summaries, pool) };
}

describe("configured runtime storage failures", () => {
  it("permits the explicit legacy mode when no typed database is configured", async () => {
    const io = await writer(false);
    expect(await io.save.save(detail())).toMatchObject({ summary: { runId: "run.one" } });
    expect(JSON.parse(await readFile(io.file, "utf8"))).toMatchObject({ version: 1, data: { summary: { runId: "run.one" } } });
    expect(io.summaries.writeFlowRunSummary).toHaveBeenCalledOnce();
  });

  it("propagates the original configured database-open failure without writing a legacy replacement", async () => {
    const io = await writer(true);
    const cause = new Error("fixture database migration refused");
    vi.spyOn(AutomationStudioProjectRuntimeStreamStore, "open").mockRejectedValue(cause);
    await expect(io.save.save(detail())).rejects.toBe(cause);
    await expect(readFile(io.file)).rejects.toThrow(/ENOENT/u);
    expect(io.summaries.writeFlowRunSummary).not.toHaveBeenCalled();
  });

  it("writes the legacy detail when the store is unavailable, and the next typed save merges it", async () => {
    const io = await writer(true);
    const open = vi.spyOn(AutomationStudioProjectRuntimeStreamStore, "open").mockRejectedValueOnce(new AutomationStudioProjectStoreUnavailableError("Automation Studio project database pool is closing."));
    const closedDetail = { ...detail(), metadata: { projectStoreUnavailable: true } };
    expect(await io.save.save(closedDetail)).toMatchObject({ summary: { runId: "run.one" } });
    expect(JSON.parse(await readFile(io.file, "utf8"))).toMatchObject({ data: { summary: { runId: "run.one" }, metadata: { projectStoreUnavailable: true } } });
    open.mockRestore();
    const merged = await io.save.save(detail());
    expect(merged.metadata).toMatchObject({ projectStoreUnavailable: true });
    const store = await AutomationStudioProjectRuntimeStreamStore.open({ pool: pools[0]!, projectId: "project.one" });
    try { expect((await store.getRunDetail("run.one", { includeCollections: false }))?.metadata).toMatchObject({ projectStoreUnavailable: true }); } finally { await store.close(); }
  });

  it("still propagates any other open failure, even one that mentions the pool", async () => {
    const io = await writer(true);
    const cause = new Error("Automation Studio project database pool is closing.");
    vi.spyOn(AutomationStudioProjectRuntimeStreamStore, "open").mockRejectedValue(cause);
    await expect(io.save.save(detail())).rejects.toBe(cause);
    await expect(readFile(io.file)).rejects.toThrow(/ENOENT/u);
  });

  it.each([false, true])("propagates the original write failure, even if cleanup also fails; existing run: %s", async (existing) => {
    const io = await writer(true);
    if (existing) await io.save.save(detail());
    const cause = new Error("fixture SQL write refused");
    vi.spyOn(AutomationStudioProjectRuntimeStreamStore.prototype, "putRunDetail").mockRejectedValue(cause);
    const close = AutomationStudioProjectRuntimeStreamStore.prototype.close;
    const closed = vi.spyOn(AutomationStudioProjectRuntimeStreamStore.prototype, "close").mockImplementation(async function (this: AutomationStudioProjectRuntimeStreamStore) {
      await close.call(this);
      throw new Error("fixture secondary close failure");
    });
    await expect(io.save.save(detail())).rejects.toBe(cause);
    expect(closed).toHaveBeenCalledOnce();
    await expect(readFile(io.file)).rejects.toThrow(/ENOENT/u);
    expect(io.summaries.writeFlowRunSummary).not.toHaveBeenCalled();
  });
});
