// @fluxiq-test-group real-sql
// A record field mapped into a FluxNode's secret input (`format: "secret"`) by a pipeline: the pipeline run
// withholds it like a declared secret everywhere it keeps or shows it (its events, result, the datasets its
// sink stored, the mapped call's own run, and every file Core wrote), and what it remembers between runs holds
// none of it (a call to such a FluxNode is never cached, and a step is never skipped by a key made of the
// secret's field).
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fluxNodeSpecSchema, parseDataPipeline, type DataPipelineInput } from "@fluxiq/contracts/fluxnode";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import { complete, toolCall } from "../../../answer-first/tests/fake-library.ts";
import { LOANS_OUTPUT } from "../../../answer-first/tests/fake-library-engine.ts";
import type { PipelineState } from "../../../pipelines/index.ts";
import { FIND_LOANS, findLoansSpec, fluxNodeLane, OWNER } from "../../tests/library-lane.ts";
import { createPipelineDatasets } from "../datasets.ts";
import { fluxNodePipelineStateWithoutSecrets } from "../secret-safe-state.ts";

vi.setConfig({ testTimeout: 180_000 });

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0)) await cleanup(); });

const SECRET = "clockm";
const spec = () => fluxNodeSpecSchema.parse(findLoansSpec({ hasCheck: false, options: { judge: "off" }, inputs: { type: "object", properties: { title: { type: "string", format: "secret" } }, required: ["title"] } }));
const writtenFind = (): JsonObject => toolCall("find", "core.run_node", { node: FIND_LOANS, parameters: { title: { $input: "title", test: "stand-in" }, recordOutput: LOANS_OUTPUT }, consequences: [], write: true });
const pipeline = (extra: Record<string, unknown> = {}): DataPipelineInput => ({
  name: "library.secret-report",
  source: { kind: "input", field: "rows" },
  steps: [
    { id: "find", kind: "map", target: { fluxNode: "library.find-loans" }, inputs: { title: { field: "password" } }, concurrency: 1, as: "found", ...extra },
    { id: "keep", kind: "sink", to: { kind: "dataset", name: "report" } }
  ]
});
const parsed = (definition: DataPipelineInput) => {
  const result = parseDataPipeline(definition);
  if (!result.ok) throw new Error(JSON.stringify(result.issues));
  return result.value;
};

async function filesHolding(root: string, text: string): Promise<string[]> {
  const found: string[] = [];
  for (const entry of await readdir(root, { withFileTypes: true, recursive: true })) {
    if (!entry.isFile()) continue;
    const file = path.join(entry.parentPath, entry.name);
    // A file Core removes between the listing and the read (a journal, a temp file) holds nothing to find.
    const bytes = await readFile(file).catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return Buffer.alloc(0);
      throw error;
    });
    if (bytes.includes(text)) found.push(path.relative(root, file));
  }
  return found;
}

describe("a pipeline maps a record field into a FluxNode's secret input", () => {
  it("withholds the value from the pipeline run's events, result, datasets, the call's own run and every file", async () => {
    const lane = await fluxNodeLane(cleanups);
    expect(await lane.fluxNodes.register(OWNER, { spec: spec() })).toMatchObject({ ok: true });
    const run = await lane.run({ pipeline: parsed(pipeline()), inputs: { rows: [{ user: "ann", password: SECRET }] } }, { script: [writtenFind(), toolCall("forward", "core.run_flow", { from: 2 }), complete("Found the loans.")] });
    expect(run.result).toMatchObject({ status: "achieved" });
    // The call itself ran with the value: its rows came back.
    expect(lane.library.calls.some((call) => (call.value.parameters as JsonObject | undefined)?.title === SECRET)).toBe(true);
    expect(JSON.stringify(run.result.outputs)).toContain("Clockmaking");
    expect(run.result.outputs).toMatchObject([{ user: "ann", password: "[withheld]" }]);
    expect(JSON.stringify([run.events, run.result, run.state])).not.toContain(SECRET);
    // The mapped call's own run, found by the pipeline's correlation id, withholds it too.
    const children = await lane.fluxNodes.list(OWNER, { limit: 20, correlationId: run.result.runId });
    expect(children).toMatchObject({ ok: true });
    const listed = children.ok ? children.value.runs : [];
    expect(listed.length).toBeGreaterThan(0);
    expect(JSON.stringify(children)).not.toContain(SECRET);
    for (const child of listed) expect(JSON.stringify(await lane.fluxNodes.get(OWNER, child.runId))).not.toContain(SECRET);
    expect(await filesHolding(lane.dataDir, SECRET)).toEqual([]);
    expect(run.result.datasets).toHaveLength(1);
  });
});

describe("what a pipeline remembers holds none of a mapped secret", () => {
  /** A state that records every key it is given. */
  const recording = () => {
    const seen: string[] = [];
    const state: PipelineState = {
      isProcessed: async (_project, _name, _step, key) => {
        seen.push(key);
        return false;
      },
      markProcessed: async (_project, _name, _step, key) => {
        seen.push(key);
      },
      getCachedCall: async (_project, key) => {
        seen.push(key);
        return undefined;
      },
      putCachedCall: async (_project, key) => {
        seen.push(key);
      }
    };
    return { state, seen };
  };
  const flows = { find: async (name: string) => (name === "library.find-loans" ? { found: { spec: spec() } } : { missing: true }) } as unknown as Parameters<typeof fluxNodePipelineStateWithoutSecrets>[2];
  const callKey = JSON.stringify({ target: { fluxNode: "library.find-loans" }, inputs: { title: SECRET } });

  it("never caches a call to a FluxNode with a secret input, so no call key holds the value", async () => {
    const { state, seen } = recording();
    const safe = await fluxNodePipelineStateWithoutSecrets(state, parsed(pipeline({ reuseResultsForMs: 60_000 })), flows);
    expect(await safe.getCachedCall("p", callKey, 0)).toBeUndefined();
    await safe.putCachedCall("p", callKey, { outputs: null, lineage: [] }, 1);
    expect(seen).toEqual([]);
  });

  it("never skips or stores a key for a step whose key reads the field the secret comes from, and keeps a key that does not", async () => {
    const { state, seen } = recording();
    const reading = await fluxNodePipelineStateWithoutSecrets(state, parsed(pipeline({ skipProcessedBy: ["password"] })), flows);
    await reading.markProcessed("p", "library.secret-report", "find", JSON.stringify([SECRET]));
    expect(await reading.isProcessed("p", "library.secret-report", "find", JSON.stringify([SECRET]))).toBe(false);
    expect(seen).toEqual([]);
    const apart = await fluxNodePipelineStateWithoutSecrets(state, parsed(pipeline({ skipProcessedBy: ["user"] })), flows);
    await apart.markProcessed("p", "library.secret-report", "find", JSON.stringify(["ann"]));
    expect(seen).toEqual([JSON.stringify(["ann"])]);
  });

  it("is the state itself when no secret input is mapped", async () => {
    const { state } = recording();
    const none = { find: async () => ({ missing: true }) } as unknown as Parameters<typeof fluxNodePipelineStateWithoutSecrets>[2];
    expect(await fluxNodePipelineStateWithoutSecrets(state, parsed(pipeline()), none)).toBe(state);
  });
});

describe("the datasets a run stored", () => {
  it("are withheld afterwards, those stored before the value was met too, and only that run's", async () => {
    const datasets = createPipelineDatasets();
    const ref = await datasets.writerFor("run1")("early", [{ user: "ann", password: SECRET }]);
    const other = await datasets.writerFor("other")("untouched", [{ password: SECRET }]);
    datasets.withhold("run1", [SECRET]);
    expect(await datasets.read(ref)).toEqual([{ user: "ann", password: "[withheld]" }]);
    expect(await datasets.read(other)).toEqual([{ password: SECRET }]);
  });
});
