// @fluxiq-test-group real-sql
// `await fluxiq.run(node, inputs)` end to end (fluxnode-plan P2b acceptance): the real `@fluxiq/sdk` client over
// loopback HTTP to the real FluxNode API, backed by the real runner on the lending library with a scripted
// model (`./sdk-lane.ts`). No live model, no browser, no money. Each test asserts what the SDK returned
// (status, outputs, verdict, path, cost) and how many times the scripted model was asked.
import { defineFluxNode, pipeline, z, type FluxNodeCheck } from "@fluxiq/sdk";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { JsonObject } from "../../../core/index.ts";
import type { AutomationStudioLlmTaskRequest } from "../../../runtime/llm/index.ts";
import { complete, LOOK_TOOL, runNode } from "../../../framework/automation-service/service/answer-first/tests/fake-library.ts";
import { findLoans } from "../../../framework/automation-service/service/fluxnode/tests/library-lane.ts";
import { sdkLane } from "./sdk-lane.ts";

vi.setConfig({ testTimeout: 180_000 });

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0)) await cleanup(); });

const GOAL = "List my loans whose title has {title} in it.";
const inputs = z.object({ title: z.string() });
const loans = z.object({ loans: z.array(z.object({ title: z.string(), due: z.string() })).min(1) });
type Check = FluxNodeCheck<typeof inputs, typeof loans>;

/** A scripted decision that first writes down what the loop told the model, then makes `next`. */
function noting(said: string[], next: JsonObject): (request: AutomationStudioLlmTaskRequest) => JsonObject {
  return (request) => {
    said.push(JSON.stringify(request.context.evidenceLoop?.evidence ?? null));
    return next;
  };
}

/** The node the runner's own tests use, written the way a program writes it: typed both ways, with a check run in this process. */
function loansNode(check: Check = () => true, scope: { acts: never[]; sites?: string[] } = { acts: [] }) {
  return defineFluxNode({ name: "library.find-loans", runtime: "library", goal: GOAL, start: "library://account", inputs, outputs: loans, scope, check });
}

/** The same node with no check and no declared outputs, run with the judge off: nothing can confirm what it returns. */
const unverifiedNode = () => defineFluxNode({ name: "library.find-loans", runtime: "library", goal: GOAL, start: "library://account", inputs, scope: { acts: [] }, options: { judge: "off" } });

/** The same node typed and with the judge off, for a pipeline's mapped calls (a child that needs a check would wait on its own stream). */
const uncheckedNode = () => defineFluxNode({ name: "library.find-loans", runtime: "library", goal: GOAL, start: "library://account", inputs, outputs: loans, scope: { acts: [] }, options: { judge: "off" } });

describe("fluxiq.run over HTTP on the real runner", () => {
  it("1. run 1 explores and returns typed outputs with lineage", async () => {
    const lane = await sdkLane(cleanups);
    const model = lane.arm({ script: [findLoans("Atlas"), complete("Found the loans.")] });
    const checked: unknown[] = [];
    const node = loansNode(({ outputs, inputs: given }) => {
      checked.push({ outputs, inputs: given });
      return true;
    });
    const run = await lane.fluxiq.run(node, { title: "Atlas" });
    expect(run.status).toBe("achieved");
    if (run.status !== "achieved") throw new Error(`not achieved: ${run.status}`);
    expect(run.outputs.loans[0]?.title).toBe("Atlas of Rivers");
    expect(run.outputs).toEqual({ loans: [{ title: "Atlas of Rivers", due: "2030-01-01" }] });
    expect(run).toMatchObject({ path: "explored", flowPath: "nodes/library/find-loans", verdict: { label: "confirmed", by: "check" } });
    expect(run.lineage).toEqual([expect.objectContaining({ pointer: "/loans/0", runId: run.runId, source: { kind: "read", readId: expect.any(String) } })]);
    expect(checked).toEqual([{ outputs: run.outputs, inputs: { title: "Atlas" } }]);
    expect(run.cost.calls).toBeGreaterThan(0);
    expect(run.cost.calls).toBe(model.asked().length);
    expect(model.judgeCalls()).toHaveLength(0);
  });

  it("2. run 2 with new inputs replays with zero model calls and returns the new inputs' result", async () => {
    const lane = await sdkLane(cleanups);
    const node = loansNode();
    lane.arm({ script: [findLoans("Atlas"), complete("Found the loans.")] });
    const first = await lane.fluxiq.run(node, { title: "Atlas" });
    expect(first.status).toBe("achieved");

    const model = lane.arm();
    const second = await lane.fluxiq.run(node, { title: "Clock" });
    expect(second.status).toBe("achieved");
    if (second.status !== "achieved") throw new Error(`not achieved: ${second.status}`);
    expect(second.outputs).toEqual({ loans: [{ title: "Clockmaking", due: "2030-01-03" }] });
    expect(second).toMatchObject({ path: "replayed", flowId: first.flowId, specHash: first.specHash, verdict: { label: "confirmed", by: "check" }, cost: { calls: 0, tokens: 0, usd: 0 } });
    expect(second.lineage).toEqual([expect.objectContaining({ pointer: "/loans/0", runId: second.runId })]);
    expect(model.asked()).toHaveLength(0);
    expect(lane.engineFinds).toEqual(["Clock"]);
  });

  it("3. a failing check goes back into the loop, and a later pass ends achieved by the check", async () => {
    const lane = await sdkLane(cleanups);
    const said: string[] = [];
    const model = lane.arm({
      script: [findLoans("Atlas"), complete("Found the loans."), noting(said, findLoans("Clock", "find.clock")), complete("Found the loans with Clock.")]
    });
    const seen: string[] = [];
    const node = loansNode(({ outputs }) => {
      seen.push(outputs.loans.map((each) => each.title).join(","));
      return outputs.loans.some((each) => each.title.includes("Clock")) || "those are not the loans whose title has Clock";
    });
    const run = await lane.fluxiq.run(node, { title: "Clock" });
    expect(run.status).toBe("achieved");
    if (run.status !== "achieved") throw new Error(`not achieved: ${run.status}`);
    // The run keeps what it read, so the second answer holds the first read's loan and the new one.
    expect(seen).toEqual(["Atlas of Rivers", "Atlas of Rivers,Clockmaking"]);
    expect(said[0]).toContain("those are not the loans whose title has Clock");
    expect(run.outputs.loans.map((each) => each.title)).toEqual(["Atlas of Rivers", "Clockmaking"]);
    expect(run.verdict).toMatchObject({ label: "confirmed", by: "check" });
    expect(run.path).toBe("explored");
    expect(model.judgeCalls()).toHaveLength(0);
    expect(run.cost.calls).toBe(model.asked().length);
    expect(model.decisions()).toHaveLength(4);
  });

  it("4a. budgetUsd 0 with a learned Flow is replay only: achieved at zero calls", async () => {
    const lane = await sdkLane(cleanups);
    const node = loansNode();
    lane.arm({ script: [findLoans("Atlas"), complete("Found the loans.")] });
    expect((await lane.fluxiq.run(node, { title: "Atlas" })).status).toBe("achieved");

    const model = lane.arm();
    const replay = await lane.fluxiq.run(node, { title: "Birds" }, { overrides: { budgetUsd: 0 } });
    expect(replay.status).toBe("achieved");
    if (replay.status !== "achieved") throw new Error(`not achieved: ${replay.status}`);
    expect(replay.outputs).toEqual({ loans: [{ title: "Birds of the Coast", due: "2030-01-02" }] });
    expect(replay).toMatchObject({ path: "replayed", verdict: { label: "confirmed", by: "check" }, cost: { calls: 0, usd: 0 } });
    expect(model.asked()).toHaveLength(0);
  });

  it("4b. budgetUsd 0 with no learned Flow is budget_out at zero calls, with a resume handle", async () => {
    const lane = await sdkLane(cleanups);
    const model = lane.arm({ script: [findLoans("Atlas"), complete("Found the loans.")] });
    const run = await lane.fluxiq.run(loansNode(), { title: "Atlas" }, { overrides: { budgetUsd: 0 } });
    expect(run.status).toBe("budget_out");
    expect(run.cost.calls).toBe(0);
    expect(run.resumeHandle).toEqual(expect.any(String));
    expect(model.asked()).toHaveLength(0);
    // The page is looked at for free, but nothing is read or done at the library.
    expect(lane.library.calls.filter((call) => call.toolId !== LOOK_TOOL)).toEqual([]);
  });

  describe("5. an act outside the scope is refused and the run still reaches its result another way", () => {
    it("a lasting act class the scope does not grant", async () => {
      const lane = await sdkLane(cleanups);
      const card = runNode("card", "domain.library.renew_card", {}, ["modify_existing"], { add: true });
      const said: string[] = [];
      const model = lane.arm({ script: [card, noting(said, findLoans("Birds")), complete("Found the loans.")] });
      const run = await lane.fluxiq.run(loansNode(), { title: "Birds" });
      expect(run.status).toBe("achieved");
      if (run.status !== "achieved") throw new Error(`not achieved: ${run.status}`);
      expect(run.outputs).toEqual({ loans: [{ title: "Birds of the Coast", due: "2030-01-02" }] });
      expect(lane.library.renewals).toEqual({});
      expect(said[0]).toContain("an act this task may not do (modify_existing)");
      expect(model.decisions()).toHaveLength(3);
    });

    it("an address off the scope's sites", async () => {
      const lane = await sdkLane(cleanups);
      const said: string[] = [];
      const model = lane.arm({ script: [findLoans("https://elsewhere.example/loans", "away"), noting(said, findLoans("Birds")), complete("Found the loans.")] });
      const run = await lane.fluxiq.run(loansNode(() => true, { acts: [], sites: ["library.example"] }), { title: "Birds" });
      expect(run.status).toBe("achieved");
      if (run.status !== "achieved") throw new Error(`not achieved: ${run.status}`);
      expect(run.outputs).toEqual({ loans: [{ title: "Birds of the Coast", due: "2030-01-02" }] });
      expect(said[0]).toContain("elsewhere.example is outside the sites this task may use (library.example)");
      expect(lane.library.calls.filter((call) => JSON.stringify(call.value).includes("elsewhere.example"))).toEqual([]);
      expect(model.decisions()).toHaveLength(3);
    });
  });

  it("6. judge off with no check ends achieved and unverified, with no judge call", async () => {
    const lane = await sdkLane(cleanups);
    const model = lane.arm({ script: [findLoans("Birds"), complete("Found the loans.")] });
    const run = await lane.fluxiq.run(unverifiedNode(), { title: "Birds" });
    expect(run.status).toBe("achieved");
    expect(run.verdict).toMatchObject({ label: "unverified" });
    expect(run.verdict.by).toBeUndefined();
    expect(run.path).toBe("explored");
    expect(run.outputs).toEqual({ records: [{ title: "Birds of the Coast", due: "2030-01-02" }] });
    expect(model.judgeCalls()).toHaveLength(0);
  });

  it("7. a pipeline maps the node over input records and returns typed records with lineage", async () => {
    const lane = await sdkLane(cleanups);
    const finder = uncheckedNode();
    await lane.fluxiq.register(finder);
    const report = z.object({ title: z.string(), found: loans });
    type Row = z.infer<typeof report>;
    const built = pipeline("library.loan-report", { inputs: z.object({ titles: z.array(inputs) }) })
      .fromInput("titles")
      .map(finder, { inputs: { title: { field: "title" } }, concurrency: 1, as: "found" })
      .outputs(report)
      .build();
    const model = lane.arm({ script: [findLoans("Atlas"), complete("Found the loans.")] });
    const run = await lane.fluxiq.runPipeline<Row>(built, { titles: [{ title: "Atlas" }, { title: "Clock" }] });
    expect(run.status).toBe("achieved");
    if (run.status !== "achieved") throw new Error(`not achieved: ${run.status}`);
    expect(run.outputs).toEqual([
      { title: "Atlas", found: { loans: [{ title: "Atlas of Rivers", due: "2030-01-01" }] } },
      { title: "Clock", found: { loans: [{ title: "Clockmaking", due: "2030-01-03" }] } }
    ]);
    expect(run.outputs[1]?.found.loans[0]?.title).toBe("Clockmaking");
    expect(run).toMatchObject({ name: "library.loan-report", verdict: { label: "confirmed", by: "type" } });
    expect(run.lineage).toEqual(expect.arrayContaining([
      expect.objectContaining({ pointer: "/0/found/loans/0", source: expect.objectContaining({ kind: "read" }) }),
      expect.objectContaining({ pointer: "/1/found/loans/0", source: expect.objectContaining({ kind: "read" }) })
    ]));
    // One exploration made every model call: the second record replayed what the first learned.
    expect(model.decisions()).toHaveLength(2);

    const again = lane.arm();
    const second = await lane.fluxiq.runPipeline<Row>(built, { titles: [{ title: "Atlas" }, { title: "Clock" }] });
    expect(second).toMatchObject({ status: "achieved", path: "replayed", cost: { calls: 0 } });
    expect(again.asked()).toHaveLength(0);
  });
});
