// @fluxiq-test-group real-sql
// A data pipeline run through the FluxNode service, on the real service with a scripted model and the lending
// library (`../../tests/library-lane.ts`): a pipeline that maps a registered FluxNode over input records
// returns typed outputs with lineage, and its second run replays every mapped call at no model call; the
// program's callbacks are answered over `transform_needed`; a mapped call that ends budget_out ends the
// pipeline budget_out; and the program's Stop ends it stopped.
import { dataPipelineHash, fluxNodeRunStateSchema, fluxNodeSpecSchema, parseDataPipeline, parseFluxNodeRunEvent, parseFluxNodeRunResult, type DataPipelineInput, type FluxNodeEventAnswer, type FluxNodeRunEvent } from "@fluxiq/contracts/fluxnode";
import { afterEach, describe, expect, it, vi } from "vitest";
import { complete } from "../../../answer-first/tests/fake-library.ts";
import { findLoans, findLoansSpec, fluxNodeLane, OWNER } from "../../tests/library-lane.ts";

vi.setConfig({ testTimeout: 180_000 });

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0)) await cleanup(); });

/** A FluxNode that finds the loans with a title, typed, with no check of its own and no judge. */
const finder = () => fluxNodeSpecSchema.parse(findLoansSpec({ hasCheck: false, options: { judge: "off" } }));

const REPORT: DataPipelineInput = {
  name: "library.loan-report",
  inputs: { type: "object", properties: { titles: { type: "array" } }, required: ["titles"] },
  source: { kind: "input", field: "titles" },
  steps: [{ id: "find", kind: "map", target: { fluxNode: "library.find-loans" }, inputs: { title: { field: "title" } }, concurrency: 1, as: "found" }],
  outputs: { type: "object", properties: { title: { type: "string" }, found: { type: "object", properties: { loans: { type: "array", minItems: 1 } }, required: ["loans"] } }, required: ["title", "found"] }
};
const TITLES = { titles: [{ title: "Atlas" }, { title: "Clock" }] };

function parsedPipeline(definition: DataPipelineInput) {
  const parsed = parseDataPipeline(definition);
  if (!parsed.ok) throw new Error(`a bad pipeline in the test: ${JSON.stringify(parsed.issues)}`);
  return parsed.value;
}

function expectContractShapes(run: { events: FluxNodeRunEvent[]; result: unknown; state: unknown }): void {
  for (const event of run.events) expect(parseFluxNodeRunEvent(event), JSON.stringify(event)).toMatchObject({ ok: true });
  expect(run.events.map((event) => event.seq)).toEqual(run.events.map((_event, index) => index + 1));
  expect(run.events.at(-1)?.type).toBe("ended");
  const parsed = parseFluxNodeRunResult(run.result);
  expect(parsed.ok, JSON.stringify(parsed)).toBe(true);
  expect(fluxNodeRunStateSchema.safeParse(run.state).success).toBe(true);
}

describe("a pipeline maps a FluxNode over records", () => {
  it("returns typed outputs with lineage, registers by name, and replays every mapped call at no model call the second time", async () => {
    const lane = await fluxNodeLane(cleanups);
    expect(await lane.fluxNodes.register(OWNER, { spec: finder() })).toMatchObject({ ok: true });

    const first = await lane.run({ pipeline: REPORT, inputs: TITLES }, { script: [findLoans("Atlas"), complete("Found the loans.")] });
    expectContractShapes(first);
    const expected = [
      { title: "Atlas", found: { loans: [{ title: "Atlas of Rivers", due: "2030-01-01" }] } },
      { title: "Clock", found: { loans: [{ title: "Clockmaking", due: "2030-01-03" }] } }
    ];
    expect(first.result).toMatchObject({ status: "achieved", flowPath: "nodes/library/loan-report", name: "library.loan-report", verdict: { label: "confirmed", by: "type" }, path: "explored" });
    expect(first.result.specHash).toBe(await dataPipelineHash(parsedPipeline(REPORT)));
    expect(first.result.outputs).toEqual(expected);
    expect(first.result.outputsType).toBeUndefined();
    expect(first.result.cost.calls).toBeGreaterThan(0);
    // The second record replayed what the first learned: one exploration made every model call.
    expect(first.decisions).toHaveLength(2);
    expect(first.result.lineage).toEqual(expect.arrayContaining([
      expect.objectContaining({ pointer: "/0/found/loans/0", source: expect.objectContaining({ kind: "read" }) }),
      expect.objectContaining({ pointer: "/1/found/loans/0", source: expect.objectContaining({ kind: "read" }) })
    ]));
    expect(first.events.filter((event) => event.type === "step" && event.stepId.startsWith("call."))).toHaveLength(4);
    const children = await lane.fluxNodes.list(OWNER, { limit: 20, correlationId: first.result.runId });
    expect(children).toMatchObject({ ok: true, value: { runs: [expect.objectContaining({ name: "library.find-loans" }), expect.objectContaining({ name: "library.find-loans" })] } });

    // Registered by its name: the same pipeline answers the same hash, and runs by name.
    const again = await lane.fluxNodes.register(OWNER, { pipeline: parsedPipeline(REPORT) });
    expect(again).toMatchObject({ ok: true, value: { name: "library.loan-report", specHash: first.result.specHash, created: false, flowPath: "nodes/library/loan-report" } });
    const second = await lane.run({ name: "library.loan-report", inputs: TITLES });
    expectContractShapes(second);
    expect(second.asked).toHaveLength(0);
    expect(second.result).toMatchObject({ status: "achieved", path: "replayed", flowId: first.result.flowId, specHash: first.result.specHash, cost: { calls: 0, tokens: 0, usd: 0 } });
    expect(second.result.outputs).toEqual(expected);
    // The same records trace to the same places in the outputs (a replayed read names its row as the engine reads it).
    expect(second.result.lineage?.map((entry) => `${(entry.stepId ?? "").split(".")[0]}:${entry.pointer}`)).toEqual(first.result.lineage?.map((entry) => `${(entry.stepId ?? "").split(".")[0]}:${entry.pointer}`));
    expect(second.result.lineage).toEqual(expect.arrayContaining([expect.objectContaining({ pointer: "/1/found/loans/0", runId: expect.any(String) })]));
  });

  it("answers the program's callbacks over transform_needed and calls its sink callback with the final records", async () => {
    const lane = await fluxNodeLane(cleanups);
    const pipeline: DataPipelineInput = {
      name: "demo.double-it",
      source: { kind: "input", field: "rows" },
      steps: [{ id: "double", kind: "transform", callback: "doubleIt" }, { id: "tell", kind: "sink", to: { kind: "sdk", callback: "onRows" } }]
    };
    const seen: { stepId: string; callback: string }[] = [];
    const answers = (event: FluxNodeRunEvent): FluxNodeEventAnswer | undefined => {
      if (event.type !== "transform_needed") return undefined;
      seen.push({ stepId: event.stepId, callback: event.callback });
      return { type: "transform_answer", eventId: event.eventId, records: event.callback === "doubleIt" ? event.records.map((row) => ({ n: Number(row["n"]) * 2 })) : [] };
    };
    const run = await lane.run({ pipeline, inputs: { rows: [{ n: 1 }, { n: 2 }] } }, { answers });
    expectContractShapes(run);
    expect(seen).toEqual([{ stepId: "double", callback: "doubleIt" }, { stepId: "tell", callback: "onRows" }]);
    expect(run.result).toMatchObject({ status: "achieved", verdict: { label: "unverified" }, cost: { calls: 0, tokens: 0, usd: 0 } });
    expect(run.result.outputs).toEqual([{ n: 2 }, { n: 4 }]);
    expect(run.result.outputsType).toMatchObject({ type: "array" });
    expect(run.asked).toHaveLength(0);
  });

  it("ends stopped with a failed step when the program's callback raises, and when a mapped FluxNode is not registered", async () => {
    const lane = await fluxNodeLane(cleanups);
    const callback: DataPipelineInput = { name: "demo.raises", source: { kind: "input", field: "rows" }, steps: [{ id: "bad", kind: "transform", callback: "breaks" }] };
    const raised = await lane.run({ pipeline: callback, inputs: { rows: [{ n: 1 }] } }, {
      answers: (event) => (event.type === "transform_needed" ? { type: "transform_answer", eventId: event.eventId, error: "the callback broke" } : undefined)
    });
    expectContractShapes(raised);
    expect(raised.result.status).toBe("stopped");
    expect(raised.events.find((event) => event.type === "step" && event.state === "failed")).toMatchObject({ label: expect.stringContaining("the callback broke") });

    const unknown = await lane.run({ pipeline: REPORT, inputs: TITLES });
    expect(unknown.result.status).toBe("stopped");
    expect(unknown.events.find((event) => event.type === "step" && event.state === "failed")).toMatchObject({ label: expect.stringContaining("No FluxNode named") });
  });

  it("ends budget_out with a resume handle when a mapped call's budget is gone, and refuses inputs that do not fit", async () => {
    const lane = await fluxNodeLane(cleanups);
    await lane.fluxNodes.register(OWNER, { spec: fluxNodeSpecSchema.parse(findLoansSpec({ hasCheck: false, options: { judge: "off", budgetUsd: 0.0001 } })) });
    const run = await lane.run({ pipeline: REPORT, inputs: TITLES }, { script: [findLoans("Atlas"), complete("Found the loans.")] });
    expectContractShapes(run);
    expect(run.result.status).toBe("budget_out");
    expect(run.result.resumeHandle).toEqual(expect.any(String));
    expect(run.result.outputs).toBeUndefined();
    expect(run.result.cost.calls).toBeGreaterThan(0);

    const refused = await lane.fluxNodes.start(OWNER, { pipeline: parsedPipeline(REPORT), inputs: { titles: "not a list" } });
    expect(refused).toMatchObject({ ok: false, refusal: { code: "invalid_inputs" } });

    // A registered name that holds a pipeline takes no overrides either (the contract refuses an inline one).
    const byName = await lane.fluxNodes.start(OWNER, { name: "library.loan-report", inputs: TITLES, overrides: { judgeCriteria: ["Every title is listed."] } });
    expect(byName).toMatchObject({ ok: false, refusal: { code: "invalid_request", issues: [{ path: "/overrides", code: "run_request.overrides_on_pipeline" }] } });
  });

  it("ends stopped when the program stops it while a callback waits", async () => {
    const lane = await fluxNodeLane(cleanups);
    const pipeline: DataPipelineInput = { name: "demo.waits", source: { kind: "input", field: "rows" }, steps: [{ id: "wait", kind: "transform", callback: "never" }] };
    const run = await lane.run({ pipeline, inputs: { rows: [{ n: 1 }] } }, {
      answers: (event) => {
        if (event.type === "transform_needed") void lane.fluxNodes.stop(OWNER, event.runId, { reason: "enough" });
        return undefined;
      }
    });
    expectContractShapes(run);
    expect(run.result.status).toBe("stopped");
    expect(run.result.resumeHandle).toBeUndefined();
  });
});
