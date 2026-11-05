// How a forward run walks a repeat it was asked for by its first step, and how each pass gets to its list (t869,
// `../../replay/forward.ts`).
//
// Paid run `run-mw37vz9n-a77a02c2` asked `{from: 23}`, where 17 read the list and 23 opened a row: the steps went once,
// with no row, from a page that was no list at all. Here the list is read first, on its own page, and each row goes
// through the loop. A row the record refuses partway is left out, a row whose way back failed is still done, and a
// repeat with no rows to walk sends nothing at all.
// The llm barrel first, as `../../../decision-context/tests/recorded-runs.ts` says why.
import { describe, expect, it } from "vitest";
import { runAutomationStudioFlowDraftPart, type AutomationStudioLlmEvidenceToolExecutionResult } from "../../../index.ts";
import type { AutomationStudioFlowDraftStep } from "../../../../flow-authoring/draft/index.ts";
import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioFlowDraftReplayNode } from "../../replay/index.ts";

const REPLAYED = "core.replay.replayed";
const ALREADY_DONE = "attempt.act_already_done";
const NODES: Record<string, AutomationStudioFlowDraftReplayNode> = {
  "node.list": { inputs: [], outputs: [{ id: "records", type: "array" }] },
  "node.check": { inputs: [], outputs: [] },
  "node.press": { inputs: [{ id: "item" }], outputs: [] }
};
const ROWS: JsonObject[] = [{ name: "Ada" }, { name: "Ben" }, { name: "Cyd" }];

const step = (position: number, node: string, over: Partial<AutomationStudioFlowDraftStep> = {}, consequences: string[] = []): AutomationStudioFlowDraftStep => ({
  position, id: `d${position}`, iteration: position, actionId: node, toolId: "core.run_node",
  input: { node, parameters: {}, consequences }, ranWith: { node, parameters: { target: `#s${position}` }, consequences },
  effect: node === "node.list" || node === "node.check" ? "observe" : "mutate", effectApplied: true, disposition: "kept", proposes: true,
  replay: { from: { location: `https://site.test/${position}` } }, ...over
});

/** A read, a step after it, then a row's three steps over the read, then a step after them: as the paid run's draft stood. */
const draft = () => [
  step(1, "node.list"),
  step(2, "node.press"),
  step(3, "node.press", { routing: { kind: "repeat", over: "d1", through: "d5" } }),
  step(4, "node.press", {}, ["modify_existing"]),
  step(5, "node.press"),
  step(6, "node.press")
];

type Call = { callId: string; toolId: string; value: JsonObject };
type Answer = Partial<AutomationStudioLlmEvidenceToolExecutionResult>;

function host(answers: Record<string, Answer> = {}, rows: JsonObject[] | null = ROWS) {
  const calls: Call[] = [];
  const executeTool = async (call: Call): Promise<AutomationStudioLlmEvidenceToolExecutionResult> => {
    calls.push(call);
    return {
      kind: "llm_evidence_tool_execution", evidence: { call: call.callId }, effectApplied: true, resultCode: REPLAYED,
      ...(call.value.node === "node.list" && rows ? { outputs: { records: rows } } : {}),
      ...answers[call.callId]
    };
  };
  return { calls, executeTool };
}

const forward = (done: string[] = []) => ({ rowDone: (row: JsonObject) => done.includes(String(row.name)), stepDone: () => false, answeredDone: (code: string | undefined) => code === ALREADY_DONE });
const run = (steps: AutomationStudioFlowDraftStep[], executor: ReturnType<typeof host>, from: number, done: string[] = []) =>
  runAutomationStudioFlowDraftPart({ steps, value: { from }, callId: "fw", executeTool: executor.executeTool, nodeOf: (id) => NODES[id], forward: forward(done) });
const ids = (executor: ReturnType<typeof host>) => executor.calls.map((call) => call.callId);
const valueOf = (executor: ReturnType<typeof host>, callId: string) => executor.calls.find((call) => call.callId === callId)!.value;
const failing: Answer = { effectApplied: false, resultCode: "core.replay.failed" };

describe("a forward run asked for from a repeat's first step", () => {
  it("reads the repeat's list first, on the list's own page, and goes through its rows", async () => {
    const executor = host();
    const result = await run(draft(), executor, 3, ["Ada"]);
    expect(ids(executor)).toEqual(["fw.1", "fw.3.pass.2", "fw.4.pass.2", "fw.5.pass.2", "fw.3.pass.3", "fw.4.pass.3", "fw.5.pass.3", "fw.6"]);
    expect(valueOf(executor, "fw.1")).toMatchObject({ replay: "step", reach: true, from: { location: "https://site.test/1" } });
    expect(result.evidence).toMatchObject({ passed: true, from: 3, rows: { done: 2, skipped: 1, failed: 0 } });
    expect(executor.calls.some((call) => call.value.replay === "reset")).toBe(false);
  });

  it("takes the whole repeat when the range starts inside it", async () => {
    const executor = host();
    const result = await run(draft(), executor, 4, ["Ada", "Ben"]);
    expect(ids(executor)).toEqual(["fw.1", "fw.3.pass.3", "fw.4.pass.3", "fw.5.pass.3", "fw.6"]);
    expect(result.evidence).toMatchObject({ passed: true, rows: { done: 1, skipped: 2, failed: 0 } });
  });

  it("does not bring in a list the range holds, and reads it where the page stands", async () => {
    const executor = host();
    await run(draft(), executor, 1, ["Ada"]);
    expect(valueOf(executor, "fw.1").reach).toBeUndefined();
  });

  it("a list in the range that says this is not its page is read once more, on its page", async () => {
    const executor = host({ "fw.1": { effectApplied: false, resultCode: "core.replay.unreproducible" } });
    const result = await run(draft(), executor, 1, ["Ada", "Ben", "Cyd"]);
    expect(ids(executor).slice(0, 2)).toEqual(["fw.1", "fw.1.reached"]);
    expect(valueOf(executor, "fw.1.reached").reach).toBe(true);
    expect(result.evidence).toMatchObject({ rows: { skipped: 3 } });
  });

  it("a part run that is no forward run is as it was: the repeat goes once, with no list", async () => {
    const executor = host();
    await runAutomationStudioFlowDraftPart({ steps: draft(), value: { from: 3 }, callId: "fw", executeTool: executor.executeTool, nodeOf: (id) => NODES[id] });
    expect(ids(executor)).toEqual(["fw.3", "fw.4", "fw.5", "fw.6"]);
  });
});

describe("a repeat with no rows to walk", () => {
  it("sends none of itself and nothing after it, stops there, and says why: never a lasting step with no row", async () => {
    const executor = host({}, null);
    const result = await run(draft(), executor, 1);
    expect(ids(executor)).toEqual(["fw.1", "fw.2"]);
    expect(result.resultCode).toBe("core.run_flow.stopped");
    expect(result.evidence).toMatchObject({ ok: true, passed: false, stoppedAt: 3 });
    expect((result.evidence as { steps: JsonObject[] }).steps.map((each) => each.step)).toEqual([1, 2, 3]);
    expect(String((result.evidence as JsonObject).instruction)).toMatch(/answered no rows/u);
    expect(String((result.evidence as JsonObject).instruction)).not.toMatch(/core\.|no_rows/u);
  });

  it("a list that cannot be read stops at the list, and sends nothing of the repeat", async () => {
    const executor = host({ "fw.1": failing });
    const result = await run(draft(), executor, 3);
    expect(ids(executor)).toEqual(["fw.1"]);
    expect(result.evidence).toMatchObject({ passed: false, stoppedAt: 1 });
  });

  it("a repeat over a check that does not hold runs zero times, as the Flow does, and the run goes on", async () => {
    const steps = [step(1, "node.check"), step(2, "node.press", { routing: { kind: "repeat", over: "d1", through: "d3" } }, ["modify_existing"]), step(3, "node.press"), step(4, "node.press")];
    const executor = host({ "fw.1": failing });
    const result = await run(steps, executor, 2);
    expect(ids(executor)).toEqual(["fw.1", "fw.4"]);
    expect(result.resultCode).toBe("core.run_flow.ran");
  });
});

describe("a pass the record refuses partway", () => {
  it("is closed there: its way back still runs, it counts as skipped and is never named, and the next row runs", async () => {
    const executor = host({ "fw.4.pass.2": { effectApplied: false, resultCode: ALREADY_DONE } });
    const result = await run(draft(), executor, 1, ["Ada"]);
    expect(ids(executor).filter((id) => id.endsWith(".pass.2"))).toEqual(["fw.3.pass.2", "fw.4.pass.2", "fw.5.pass.2"]);
    expect(ids(executor).filter((id) => id.endsWith(".pass.3"))).toEqual(["fw.3.pass.3", "fw.4.pass.3", "fw.5.pass.3"]);
    expect(result.evidence).toMatchObject({ passed: true, rows: { done: 1, skipped: 2, failed: 0 } });
    expect((result.evidence as JsonObject).rowsNotDone).toBeUndefined();
  });

  it("refused at its first step, it sends nothing more", async () => {
    const executor = host({ "fw.3.pass.2": { effectApplied: false, resultCode: ALREADY_DONE } });
    const result = await run(draft(), executor, 1, ["Ada"]);
    expect(ids(executor).filter((id) => id.endsWith(".pass.2"))).toEqual(["fw.3.pass.2"]);
    expect(result.evidence).toMatchObject({ rows: { done: 1, skipped: 2, failed: 0 } });
  });

  it("a step outside a repeat refused as done is told and the run goes on", async () => {
    const executor = host({ "fw.2": { effectApplied: false, resultCode: ALREADY_DONE } });
    const result = await run(draft(), executor, 1, ["Ada", "Ben", "Cyd"]);
    expect(ids(executor)).toContain("fw.6");
    expect(result.resultCode).toBe("core.run_flow.ran");
  });
});

describe("how the next pass gets to the list", () => {
  it("by the loop's own way back: no pass asks for the page when it worked", async () => {
    const executor = host();
    await run(draft(), executor, 1);
    expect(executor.calls.filter((call) => call.value.reach === true)).toEqual([]);
  });

  it("a pass whose lasting step failed still comes back by its own way, and the next pass does not ask", async () => {
    const executor = host({ "fw.4.pass.2": failing });
    const result = await run(draft(), executor, 1);
    expect(ids(executor)).toContain("fw.5.pass.2");
    expect(valueOf(executor, "fw.3.pass.3").reach).toBeUndefined();
    expect(result.evidence).toMatchObject({ passed: false, rows: { done: 2, failed: 1 }, rowsNotDone: ["row 2"] });
  });

  it("a row whose way back alone failed is done, and the next pass goes to the list itself", async () => {
    const executor = host({ "fw.5.pass.1": failing });
    const result = await run(draft(), executor, 1);
    expect(valueOf(executor, "fw.3.pass.2").reach).toBe(true);
    expect(valueOf(executor, "fw.3.pass.3").reach).toBeUndefined();
    expect(result.evidence).toMatchObject({ passed: true, rows: { done: 3, failed: 0 } });
    expect((result.evidence as JsonObject).rowsNotDone).toBeUndefined();
  });

  it("a step failing with no way back after it leaves the next pass to go to the list itself", async () => {
    const steps = draft();
    steps[4] = step(5, "node.press", {}, ["create_new"]);
    const executor = host({ "fw.4.pass.1": failing });
    const result = await run(steps, executor, 1);
    expect(ids(executor).filter((id) => id.endsWith(".pass.1"))).toEqual(["fw.3.pass.1", "fw.4.pass.1"]);
    expect(valueOf(executor, "fw.3.pass.2").reach).toBe(true);
    expect(result.evidence).toMatchObject({ rowsNotDone: ["row 1"] });
  });

  it("a loop with no way back of its own goes to the list before each pass after the first", async () => {
    const steps = [step(1, "node.list"), step(2, "node.press", { routing: { kind: "repeat", over: "d1", through: "d3" } }), step(3, "node.press", {}, ["modify_existing"])];
    const executor = host();
    const result = await run(steps, executor, 1);
    expect(valueOf(executor, "fw.2.pass.1").reach).toBeUndefined();
    expect(valueOf(executor, "fw.2.pass.2").reach).toBe(true);
    expect(valueOf(executor, "fw.2.pass.3").reach).toBe(true);
    expect(valueOf(executor, "fw.3.pass.2").reach).toBeUndefined();
    expect(result.evidence).toMatchObject({ passed: true, rows: { done: 3 } });
  });

  it("a repeat of one step never asks: it did not set out to leave its list", async () => {
    const steps = [step(1, "node.list"), step(2, "node.press", { routing: { kind: "repeat", over: "d1", through: "d2" } }, ["modify_existing"])];
    const executor = host();
    await run(steps, executor, 1);
    expect(executor.calls.filter((call) => call.value.reach === true)).toEqual([]);
  });

  it("a first step that failed moved nothing, so the next pass does not ask", async () => {
    const executor = host({ "fw.3.pass.1": failing });
    await run(draft(), executor, 1);
    expect(valueOf(executor, "fw.3.pass.2").reach).toBeUndefined();
  });
});
