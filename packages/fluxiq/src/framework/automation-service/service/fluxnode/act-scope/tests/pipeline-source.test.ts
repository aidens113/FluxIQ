// @fluxiq-test-group real-sql
import { createHash } from "node:crypto";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { DataPipeline } from "@fluxiq/contracts/fluxnode";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import { AutomationStudioService } from "../../../../service.ts";
import { automationStudioAnswerFirstTaskMemoryOf } from "../../../answer-first/task-memory/index.ts";
import { pipelineMapInvocations } from "../../../pipelines/map/index.ts";
import { records } from "../../../pipelines/tests/support.ts";
import { FluxNodePipelineSource } from "../pipeline-source.ts";
import { fluxNodePipelineSourceReference } from "../pipeline-source-reference.ts";

vi.setConfig({ testTimeout: 180_000 });
const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  for (const cleanup of cleanups.splice(0)) await cleanup();
});
const FLOW: DataPipeline["source"] = { kind: "flow", target: { fluxNode: "source.rows" } };

async function fixture() {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "fluxiq-pipeline-source-"));
  let service = new AutomationStudioService({ dataDir });
  const project = await service.createProject({ name: "Source snapshots", domainId: "library" });
  cleanups.push(async () => {
    await service.close();
    await rm(dataDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 25 });
  });
  const memory = () => automationStudioAnswerFirstTaskMemoryOf(service, { paths: service.projectPaths, projects: service.projects });
  const reference = (scope: string) => fluxNodePipelineSourceReference({ memory: memory(), projectId: project.id, taskId: "source.task", flowId: "source.flow", scope });
  const open = (scope: string, source = FLOW, inputs: JsonObject = {}, secretTexts: readonly string[] = []) => new FluxNodePipelineSource({
    projectId: project.id, runId: `run.${scope}`, source, inputs, secretTexts, snapshots: service.runDatasets, reference: reference(scope),
    fallbackReadDataset: async () => { throw new Error("No ephemeral dataset in this fixture."); }
  });
  const restart = async () => {
    await service.close();
    service = new AutomationStudioService({ dataDir });
  };
  return { dataDir, projectId: project.id, memory, reference, open, restart, get service() { return service; } };
}

describe("immutable pipeline source storage", () => {
  it("preserves equal-valued occurrences across restart and fetches new data only for a fresh scope", async () => {
    const lane = await fixture();
    const original = records([{ title: "equal", version: "old" }, { title: "equal", version: "old" }]);
    const loaded = vi.fn(async () => original);
    const first = await lane.open("first").read(loaded);
    const before = pipelineMapInvocations("save", first);
    expect(before[0]?.invocationId).not.toBe(before[1]?.invocationId);
    await lane.restart();
    const changed = vi.fn(async () => records([{ title: "changed", version: "new" }]));
    const resumed = await lane.open("first").read(changed);
    expect(resumed.map((record) => record.data)).toEqual(original.map((record) => record.data));
    expect(pipelineMapInvocations("save", resumed)).toEqual(before);
    expect(changed).not.toHaveBeenCalled();
    expect((await lane.open("fresh").read(changed)).map((record) => record.data)).toEqual([{ title: "changed", version: "new" }]);
    expect(changed).toHaveBeenCalledOnce();
    const memory = await lane.memory().get(lane.projectId, "source.task");
    expect(Object.keys(memory?.pipelineSourcesByScope ?? {})).toEqual(["first", "fresh"]);
    expect(JSON.stringify(memory)).not.toContain("version");
  });

  it("exposes no source records until the snapshot reference commits", async () => {
    const lane = await fixture();
    const reference = lane.reference("held");
    let writing = (): void => undefined;
    let commit = (): void => undefined;
    const reached = new Promise<void>((resolve) => { writing = resolve; });
    const allowed = new Promise<void>((resolve) => { commit = resolve; });
    const source = new FluxNodePipelineSource({
      projectId: lane.projectId, runId: "run.held", source: FLOW, inputs: {}, secretTexts: [], snapshots: lane.service.runDatasets,
      fallbackReadDataset: async () => [], reference: { read: reference.read, write: async (value) => {
        writing();
        await allowed;
        await reference.write(value);
      } }
    });
    let returned = false;
    const reading = source.read(async () => records([{ title: "one" }])).then((value) => {
      returned = true;
      return value;
    });
    await reached;
    expect(returned).toBe(false);
    expect(await reference.read()).toBeUndefined();
    commit();
    expect(await reading).toHaveLength(1);
    expect(await reference.read()).toMatchObject({ count: 1 });
  });

  it("stores caller-input pointers and rebinds independently rotated secrets after full restart", async () => {
    const lane = await fixture();
    const secret = "fixture-low-entropy-secret";
    const inputs = { rows: [{ first: secret, second: secret }] };
    const source: DataPipeline["source"] = { kind: "input", field: "rows" };
    await lane.open("secret", source, inputs, [secret]).read(async () => records(inputs.rows));
    const reference = (await lane.reference("secret").read())!;
    const page = await lane.service.runDatasets.readImmutableSnapshotPage({ projectId: lane.projectId, snapshotId: reference.snapshotId });
    expect(page?.rows[0]?.row).toMatchObject({ kind: "input", pointer: "/rows/0" });
    const stored = JSON.stringify([page, await lane.memory().get(lane.projectId, "source.task")]);
    expect(stored).not.toContain(secret);
    expect(stored).not.toContain(createHash("sha256").update(secret).digest("hex"));
    for (const file of (await readdir(lane.dataDir, { recursive: true })).filter((entry) => entry.endsWith(".json"))) expect(await readFile(path.join(lane.dataDir, file), "utf8")).not.toContain(secret);
    await lane.restart();
    const rotated = { rows: [{ first: "rotated-first", second: "rotated-second" }] };
    const rebound = await lane.open("secret", source, rotated, ["rotated-first", "rotated-second"]).read(async () => { throw new Error("A continuation cannot reload its source."); });
    expect(rebound.map((record) => record.data)).toEqual(rotated.rows);
  });

  it("pins existing private dataset cells without copying their secret values into its checkpoint", async () => {
    const lane = await fixture();
    const secret = "fixture-existing-private-cell";
    const original = await lane.service.runDatasets.createImmutableSnapshot({ projectId: lane.projectId, rows: [{ occurrenceId: "private-cell", row: { credential: secret } }] });
    const dataset = { datasetId: original.snapshotId, name: "private", rowCount: 1 };
    const source: DataPipeline["source"] = { kind: "dataset", dataset };
    const reader = lane.open("private", source, {}, [secret]);
    await reader.read(async () => records(await reader.readDataset(dataset)));
    const reference = (await lane.reference("private").read())!;
    const page = await lane.service.runDatasets.readImmutableSnapshotPage({ projectId: lane.projectId, snapshotId: reference.snapshotId });
    expect(page?.rows[0]?.row).toMatchObject({ kind: "dataset", snapshotId: original.snapshotId, occurrenceId: "private-cell" });
    expect(JSON.stringify([page, await lane.memory().get(lane.projectId, "source.task")])).not.toContain(secret);
    await lane.restart();
    const resumed = await lane.open("private", source, {}, [secret]).read(async () => { throw new Error("Do not reload."); });
    expect(resumed[0]?.data).toEqual({ credential: secret });
  });

  it("refuses an ephemeral secret before storing a snapshot or returning rows to a map", async () => {
    const lane = await fixture();
    const create = vi.spyOn(lane.service.runDatasets, "createImmutableSnapshot");
    const secret = "fixture-ephemeral-secret";
    await expect(lane.open("unsafe", FLOW, {}, [secret]).read(async () => records([{ credential: secret }]))).rejects.toMatchObject({ code: "pipeline.secure_source_binding_required" });
    expect(create).not.toHaveBeenCalled();
    expect(await lane.reference("unsafe").read()).toBeUndefined();
  });

  it("fails closed on a missing or unreadable source reference rather than re-enumerating", async () => {
    const lane = await fixture();
    const load = vi.fn(async () => records([{ title: "new" }]));
    await lane.reference("missing").write({ snapshotId: "missing-snapshot", count: 1 });
    await expect(lane.open("missing").read(load)).rejects.toMatchObject({ code: "pipeline.source_snapshot_unavailable" });
    await lane.memory().update(lane.projectId, "source.task", (memory) => ({ ...memory, pipelineSourcesByScope: { ...memory.pipelineSourcesByScope, broken: { snapshotId: "old", count: -1 } } }));
    await expect(lane.open("broken").read(load)).rejects.toThrow("stored execution state is unreadable");
    expect(load).not.toHaveBeenCalled();
  });

  it("serializes scope references without losing either entry", async () => {
    const lane = await fixture();
    await Promise.all([lane.reference("first").write({ snapshotId: "snapshot.first", count: 1 }), lane.reference("second").write({ snapshotId: "snapshot.second", count: 2 })]);
    await lane.restart();
    expect(await lane.reference("first").read()).toEqual({ snapshotId: "snapshot.first", count: 1 });
    expect(await lane.reference("second").read()).toEqual({ snapshotId: "snapshot.second", count: 2 });
    await expect(lane.reference("first").write({ snapshotId: "replacement", count: 1 })).rejects.toMatchObject({ code: "pipeline.source_snapshot_conflict" });
  });
});
