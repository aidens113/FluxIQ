import { dataPipelineHash } from "@fluxiq/contracts/fluxnode";
import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { SdkError } from "../../errors/index.ts";
import { pipeline } from "../../pipeline/index.ts";
import { pipelineScenario } from "../../tests/fake-engine/pipeline-scenario.ts";
import type { Scenario } from "../../tests/fake-engine/start-fake-engine.ts";
import { startKeyedEngine, type KeyedEngine } from "../../tests/fake-engine/start-keyed-engine.ts";
import { DEFAULT_ENGINE_URL } from "../index.ts";
import { FluxIQ } from "../fluxiq.ts";

let started: KeyedEngine | undefined;

async function connect(scenario: Scenario): Promise<{ fluxiq: FluxIQ; keyed: KeyedEngine }> {
  const keyed = await startKeyedEngine({ scenario });
  started = keyed;
  const fluxiq = await FluxIQ.connect({ url: keyed.engine.url, apiKey: keyed.privateKeyPem, env: {}, cwd: process.cwd() });
  return { fluxiq, keyed };
}

afterEach(async () => {
  await started?.engine.close();
  started = undefined;
});

const doubled = z.object({ n: z.number() });

function doublingPipeline(seen: unknown[] = []) {
  return pipeline("demo.double-it")
    .fromInput("rows")
    .transform({ fn: (records) => records.map((record) => ({ n: Number(record["n"]) * 2 })) })
    .sink((records) => void seen.push(records.length))
    .outputs(doubled)
    .build();
}

describe("FluxIQ.runPipeline", () => {
  it("sends the pipeline as the run target and serves its function transforms and sinks over transform_needed", async () => {
    const { fluxiq, keyed } = await connect(pipelineScenario());
    const seen: unknown[] = [];
    const built = doublingPipeline(seen);
    const run = await fluxiq.runPipeline<{ n: number }>(built, { rows: [{ n: 1 }, { n: 2 }] });
    expect(run.status).toBe("achieved");
    if (run.status !== "achieved") throw new Error("not achieved");
    expect(run.outputs).toEqual([{ n: 2 }, { n: 4 }]);
    expect(run.outputs[0]?.n).toBe(2);
    expect(seen).toEqual([2]);
    const start = keyed.engine.requests.find((request) => request.method === "POST" && request.path === "/api/fluxnode/v1/runs");
    expect(start?.body).toMatchObject({ pipeline: { name: "demo.double-it", source: { kind: "input", field: "rows" } }, inputs: { rows: [{ n: 1 }, { n: 2 }] } });
    expect(start?.body).not.toHaveProperty("spec");
    const answers = keyed.engine.requests.filter((request) => request.path.endsWith("/answers")).map((request) => request.body);
    expect(answers).toEqual([
      { type: "transform_answer", eventId: "transform_1", records: [{ n: 2 }, { n: 4 }] },
      { type: "transform_answer", eventId: "transform_2", records: [{ n: 2 }, { n: 4 }] }
    ]);
  });

  it("lets the program's own transforms replace a built callback, and passes the run options through", async () => {
    const { fluxiq, keyed } = await connect(pipelineScenario());
    const run = await fluxiq.runPipeline(doublingPipeline(), { rows: [{ n: 5 }] }, { transforms: { transform1: (records) => records.map(() => ({ n: 99 })) }, correlationId: "report-1", overrides: { budgetUsd: 1 } });
    expect(run.status === "achieved" && run.outputs).toEqual([{ n: 99 }]);
    const start = keyed.engine.requests.find((request) => request.method === "POST" && request.path === "/api/fluxnode/v1/runs");
    expect(start?.body).toMatchObject({ correlationId: "report-1", options: { budgetUsd: 1 } });
  });

  it("refuses records that miss the declared output type instead of returning them typed", async () => {
    const { fluxiq } = await connect(pipelineScenario());
    const wrong = pipeline("demo.wrong").fromInput("rows").transform({ fn: (records) => records.map(() => ({ n: "not a number" })) }).outputs(doubled).build();
    await expect(fluxiq.runPipeline(wrong, { rows: [{ n: 1 }] })).rejects.toThrow(SdkError);
    await expect(fluxiq.runPipeline(wrong, { rows: [{ n: 1 }] })).rejects.toThrow(/record 0/u);
  });

  it("returns a budget_out ending as it is and continues it with resumePipeline", async () => {
    const { fluxiq } = await connect(pipelineScenario({ endBudgetOut: true }));
    const built = doublingPipeline();
    const first = await fluxiq.runPipeline(built, { rows: [{ n: 1 }] });
    expect(first.status).toBe("budget_out");
    expect(first.resumeHandle).toBeDefined();
    const resumed = await fluxiq.resumePipeline<{ n: number }>(built, first.resumeHandle as string);
    expect(resumed.status).toBe("achieved");
    expect(resumed.status === "achieved" && resumed.outputs).toEqual([{ n: 2 }]);
  });
});

describe("FluxIQ.registerPipeline", () => {
  it("registers a pipeline without running it and answers its hash, then runs it by name", async () => {
    const { fluxiq, keyed } = await connect(pipelineScenario());
    const built = doublingPipeline();
    const registered = await fluxiq.registerPipeline(built);
    expect(registered).toMatchObject({ name: "demo.double-it", specHash: await dataPipelineHash(built.definition), flowPath: "nodes/demo/double-it", created: true });
    expect(await fluxiq.registerPipeline(built)).toMatchObject({ created: false });
    expect(keyed.engine.runs.size).toBe(0);
    expect(keyed.engine.pipelines.get("demo.double-it")).toEqual(built.definition);
  });
});

describe("the local engine's address", () => {
  it("is where fluxiq dev serves its API", () => {
    expect(DEFAULT_ENGINE_URL).toBe("http://127.0.0.1:3000");
  });
});
