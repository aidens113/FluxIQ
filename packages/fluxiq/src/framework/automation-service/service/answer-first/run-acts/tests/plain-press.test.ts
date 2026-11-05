// A plain press against a lasting one, on a stub shaped like a toggle: pressed twice, a toggle ends
// where it began, which is why a lasting press must never go twice, and why a plain one held back
// leaves a page as it was (t869, `../settling.ts`). A lending library's shelf stands in, unrelated to
// any realistic scenario. The floor is what a domain really says of every press: it commits.

import { describe, expect, it } from "vitest";
import { edge, graph } from "../../../../../../engine/automation/lifecycle-run/tests/lifecycle-fixtures.ts";
import type { AutomationStudioFlowNode } from "../../../../../../flows/executable/graph/index.ts";
import { AutomationStudioAttemptActRecord } from "../../../../../../runtime/answer-first/act-record/index.ts";
import { runAutomationStudioGraph, type AutomationStudioGraphExecutionOptions } from "../../../../executor/index.ts";
import { automationStudioAnswerFirstRunActGate } from "../index.ts";

const PRESS = "library.press";
const CONTROL = { selector: ".control", element: { text: "The control" } };
const COMMITS = () => ({ effectClass: "commit" as const, permissionConsequences: [] });
const KEY = "bootstrapSymbolicKey";

type Result = NonNullable<Awaited<ReturnType<NonNullable<AutomationStudioGraphExecutionOptions["nativeNodeExecutor"]>>>>["result"];

const press = (id: string, metadata: AutomationStudioFlowNode["metadata"] = {}): AutomationStudioFlowNode => ({ id, label: "Press the control", definitionId: PRESS, parameterValues: CONTROL, metadata });
const inLine = (...steps: AutomationStudioFlowNode[]) => graph("graph.line", [{ id: "start", definitionId: "builtin.control.start" }, ...steps, { id: "done", definitionId: "builtin.control.end" }], [
  edge("start", steps[0]!.id, "next"), ...steps.slice(1).map((step, index) => edge(steps[index]!.id, step.id)), edge(steps.at(-1)!.id, "done")
]);
const repeated = (most: number, step: AutomationStudioFlowNode) => graph("graph.repeat", [
  { id: "start", definitionId: "builtin.control.start" }, { id: "again", definitionId: "builtin.control.repeat", parameterValues: { most } }, step, { id: "done", definitionId: "builtin.control.end" }
], [edge("start", "again", "next"), edge("again", step.id, "body"), edge(step.id, "again"), edge("again", "done", "done")]);

/** A control that flips with each press that reaches it. */
function toggle(answer: (press: number) => Result = () => ({ status: "success", route: "success", outputs: {} })) {
  const state = { on: false, presses: 0 };
  const options: AutomationStudioGraphExecutionOptions = {
    inputs: {}, delay: async () => undefined, resolveActionEffect: COMMITS,
    nativeNodeExecutor: async () => {
      state.presses += 1;
      state.on = !state.on;
      return { result: answer(state.presses) };
    }
  };
  return { state, options };
}

const run = async (flow: ReturnType<typeof graph>, options: AutomationStudioGraphExecutionOptions, record: AutomationStudioAttemptActRecord, claimedActs?: ReadonlySet<string>) =>
  await runAutomationStudioGraph(flow, automationStudioAnswerFirstRunActGate(options, { record, settle: true, ...(claimedActs ? { claimedActs } : {}) }));

describe("a press that declares nothing and claims no act", () => {
  it("runs both times a Flow presses it on purpose, and goes on to its end", async () => {
    const { state, options } = toggle();
    const record = new AutomationStudioAttemptActRecord();
    const trace = await run(inLine(press("apply.1"), press("apply.2")), options, record);
    expect(trace.status).toBe("succeeded");
    expect(state.presses).toBe(2);
    expect(trace.attempts.filter((attempt) => attempt.nodeId.startsWith("apply")).every((attempt) => attempt.skipped === undefined)).toBe(true);
  });

  it("runs on every pass of a repeat with no row, as a next page does", async () => {
    const { state, options } = toggle();
    await run(repeated(3, press("next")), options, new AutomationStudioAttemptActRecord());
    expect(state.presses).toBe(3);
  });

  it("is on the record as may have landed and undeclared: out of the result's acts and of every refusal, and told to the next round", async () => {
    const { options } = toggle();
    const record = new AutomationStudioAttemptActRecord();
    await run(inLine(press("apply.1")), options, record);
    expect(record.acts()).toEqual([]);
    expect(record.data().acts).toEqual([expect.objectContaining({ state: "may_have_landed", undeclared: true, stage: "run", classes: [] })]);
    expect(record.admit({ actionId: PRESS, parameters: CONTROL, consequences: [], stage: "exploration" }).kind).toBe("run");
    expect(record.forModel().acts).toEqual([expect.objectContaining({ undeclared: true, state: "may_have_landed" })]);
  });

  it("is held to a look where its answer leaves it in doubt, and not sent again: it may be the one that landed", async () => {
    const { state, options } = toggle(() => ({ status: "failed", route: "failed", outputs: {}, message: "It did not go.", failure: { category: "ambiguous_or_unknown", code: "library.failed", retryable: false, stage: "dispatch" } }));
    const record = new AutomationStudioAttemptActRecord();
    await run(inLine(press("apply.1"), press("apply.2")), { ...options, retryPolicy: { maxAttempts: 1, backoffMs: [] } }, record);
    expect(state.presses).toBe(1);
    expect(record.acts()).toEqual([expect.objectContaining({ state: "may_have_landed" })]);
    expect(record.admit({ actionId: PRESS, parameters: CONTROL, consequences: [], stage: "exploration" }).kind).toBe("look_first");
  });

  it("is nothing on the record where it answers that nothing acted", async () => {
    const { options } = toggle(() => ({ status: "failed", route: "failed", outputs: {}, failure: { category: "target_not_found", code: "library.absent", retryable: false, stage: "target_resolution" } }));
    const record = new AutomationStudioAttemptActRecord();
    await run(inLine(press("apply.1")), { ...options, retryPolicy: { maxAttempts: 1, backoffMs: [] } }, record);
    expect(record.data().acts).toEqual([]);
  });

  it("is nothing on the record where the control already showed the asked state", async () => {
    const { options } = toggle(() => ({ status: "success", route: "success", outputs: { result: { skipped: "already_in_state" } } }));
    const record = new AutomationStudioAttemptActRecord();
    await run(inLine(press("apply.1")), options, record);
    expect(record.data().acts).toEqual([]);
  });

  it("the row-less gate of a run that does not settle is as it was", async () => {
    const { state, options } = toggle();
    const trace = await runAutomationStudioGraph(inLine(press("apply.1"), press("apply.2")), automationStudioAnswerFirstRunActGate(options, { record: new AutomationStudioAttemptActRecord() }));
    expect(trace.status).toBe("succeeded");
    expect(state.presses).toBe(2);
  });
});

describe("a lasting press is never repeated", () => {
  const declared = { declaredConsequences: ["modify_existing"] };

  it("a declared press goes once, so the toggle stays on, and the second step reads as already done", async () => {
    const { state, options } = toggle();
    const record = new AutomationStudioAttemptActRecord();
    const trace = await run(inLine(press("save.1", declared), press("save.2", declared)), options, record);
    expect(trace.status).toBe("succeeded");
    expect(state).toEqual({ on: true, presses: 1 });
    expect(trace.attempts.find((attempt) => attempt.nodeId === "save.2")?.message).toMatch(/^Already done/u);
    expect(record.acts()).toEqual([expect.objectContaining({ state: "landed", classes: ["modify_existing"] })]);
  });

  it("a press whose step claims a lasting act goes once, though it declared nothing", async () => {
    const { state, options } = toggle();
    const record = new AutomationStudioAttemptActRecord();
    await run(inLine(press("save.1", { [KEY]: "save" }), press("save.2", { [KEY]: "again" })), options, record, new Set(["save"]));
    expect(state).toEqual({ on: true, presses: 1 });
    expect(record.acts()).toEqual([expect.objectContaining({ state: "landed", classes: [] })]);
  });

  it("a plain press of a control a declared one already pressed is refused too: the repeat is what counts, whatever it declared", async () => {
    const { state, options } = toggle();
    const record = new AutomationStudioAttemptActRecord();
    await run(inLine(press("save.1", declared), press("plain.1")), options, record);
    expect(state).toEqual({ on: true, presses: 1 });
  });

  it("across a by-hand act in the same attempt", async () => {
    const { state, options } = toggle();
    const record = new AutomationStudioAttemptActRecord();
    record.settled({ actionId: PRESS, parameters: CONTROL, consequences: ["modify_existing"], stage: "exploration" }, { effectApplied: true, words: { what: "Changed it", where: "On the shelf" } });
    await run(inLine(press("save.1", declared)), options, record);
    expect(state.presses).toBe(0);
  });
});
