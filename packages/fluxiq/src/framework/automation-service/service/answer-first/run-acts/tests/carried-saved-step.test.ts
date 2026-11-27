// t1075, provider-free, on `run-mwynbry2-f3c88dc7`'s own pair: attempt 2's replay of attempt 1's saved Flow pressed the
// carried "+ Add" (step s11) a second time (step 0042, gateway event #150). The saved node carried `requiresChosen`, the
// act record counted it as identity, and the run gate found no carried act for the step.
//
//   A  The saved node now keys as the landed act, so the gate refuses s11 as already done and sends nothing.
//   B  The by-hand act is named by the step its call became when attempt 1 saves its Flow (`../step-stamps.ts`), so the
//      gate refuses s11 by that name even where its parameters say nothing of the press.

import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import type { AutomationStudioFlowNode } from "../../../../../../flows/executable/graph/index.ts";
import { edge, graph } from "../../../../../../engine/automation/lifecycle-run/tests/lifecycle-fixtures.ts";
import { AutomationStudioAttemptActRecord, automationStudioAttemptActSeed } from "../../../../../../runtime/answer-first/act-record/index.ts";
import type { AutomationStudioFlowBootstrapIssueLocator, AutomationStudioFlowBuildPlan } from "../../../../../../runtime/flow-authoring/bootstrap/index.ts";
import type { AutomationStudioFlowDraftStep } from "../../../../../../runtime/flow-authoring/draft/index.ts";
import { runAutomationStudioGraph, type AutomationStudioGraphExecutionOptions } from "../../../../executor/index.ts";
import { automationStudioAnswerFirstRunActGate, automationStudioAnswerFirstRunActStepStamps } from "../index.ts";
import { RUN_MWYNBRY2_ACTION, RUN_MWYNBRY2_ADD_ACT, RUN_MWYNBRY2_RAN_WITH, RUN_MWYNBRY2_SAVED_S11, runMwynbry2Seed } from "../../../../../../runtime/answer-first/act-record/tests/run-mwynbry2-add.ts";

/** Attempt 1's saved Flow around the press: start, s11 "+ Add" as saved, end. */
function savedFlow() {
  const s11: AutomationStudioFlowNode = { id: "node.bootstrap.a835b3a6376e1e7b.main.s11", label: "+ Add", definitionId: RUN_MWYNBRY2_ACTION, definitionVersion: "1", parameterValues: RUN_MWYNBRY2_SAVED_S11, metadata: { bootstrapSymbolicKey: "s11" } };
  const nodes = [{ id: "start", definitionId: "builtin.control.start" }, s11, { id: "done", definitionId: "builtin.control.end" }];
  return graph("graph.bigbox", nodes, [edge("start", s11.id, "next"), edge(s11.id, "done")]);
}

/** The host: every press commits (the web domain's floor) and is counted as sent. */
function host() {
  const sent: JsonObject[] = [];
  const options: AutomationStudioGraphExecutionOptions = {
    inputs: {},
    resolveActionEffect: () => ({ effectClass: "commit", permissionConsequences: [] }),
    delay: async () => undefined,
    nativeNodeExecutor: async ({ node }) => {
      sent.push((node.parameterValues ?? {}) as JsonObject);
      return { result: { status: "success", route: "success", outputs: { success: true } } };
    }
  };
  return { options, sent };
}

async function replay(record: AutomationStudioAttemptActRecord) {
  const page = host();
  const trace = await runAutomationStudioGraph(savedFlow(), automationStudioAnswerFirstRunActGate(page.options, { record, settle: true, claimedActs: new Set(["s11"]) }));
  return { trace, sent: page.sent, s11: trace.attempts.filter((attempt) => attempt.nodeId.endsWith(".s11")) };
}

describe("run-mwynbry2: attempt 2's replay of the saved \"+ Add\"", () => {
  it("A: refuses s11 as already done, with nothing sent, by the act attempt 1 landed", async () => {
    const record = new AutomationStudioAttemptActRecord({ seed: runMwynbry2Seed() });
    const { trace, sent, s11 } = await replay(record);
    expect(sent).toEqual([]);
    expect(s11).toHaveLength(1);
    expect(s11[0]).toMatchObject({ status: "succeeded", outputs: { skipped: "already_done" } });
    expect(trace.status).toBe("succeeded");
    // Nothing new went on the record: the one act is attempt 1's, still carried.
    expect(record.data().acts.map((act) => act.id)).toEqual([RUN_MWYNBRY2_ADD_ACT.id]);
  });

  it("B: refuses s11 by the step its call became, though the act's keys say nothing of the node", async () => {
    const named = { ...RUN_MWYNBRY2_ADD_ACT, keys: ["0".repeat(64)], steps: ["step:s11"] };
    const { sent, s11 } = await replay(new AutomationStudioAttemptActRecord({ seed: runMwynbry2Seed(named) }));
    expect(sent).toEqual([]);
    expect(s11[0]).toMatchObject({ outputs: { skipped: "already_done" } });
  });

  it("presses a step its act was never on", async () => {
    const other = { ...RUN_MWYNBRY2_ADD_ACT, keys: ["0".repeat(64)], steps: ["step:s12"] };
    const { sent } = await replay(new AutomationStudioAttemptActRecord({ seed: runMwynbry2Seed(other) }));
    expect(sent).toHaveLength(1);
  });
});

describe("the steps attempt 1's calls became, as its Flow is saved", () => {
  const step = (position: number, given: Partial<AutomationStudioFlowDraftStep>): AutomationStudioFlowDraftStep => ({ position, id: `d${position}`, iteration: position, actionId: RUN_MWYNBRY2_ACTION, input: {}, effect: "applied", disposition: "kept", ...given } as AutomationStudioFlowDraftStep);
  /** d10 is attempt 1's press as its draft held it: call c9, by a handle, run with the frozen target. */
  const steps = [
    step(9, { callId: "c8", actionId: "web.output.dom-select" }),
    step(10, { callId: "c9", toolId: "core.run_node", input: { node: RUN_MWYNBRY2_ACTION, parameters: { target: { handle: "t1125" } }, consequences: ["modify_existing"] }, ranWith: { node: RUN_MWYNBRY2_ACTION, parameters: RUN_MWYNBRY2_RAN_WITH, consequences: ["modify_existing"] } }),
    step(11, { callId: "c10", routing: { kind: "repeat", through: "d12", over: "d9" } }),
    step(12, { callId: "c11" })
  ];
  const plan = { plan: { subflows: [{ key: "main", nodes: [
    { key: "s10", definitionId: "web.output.dom-select" },
    { key: "s11", definitionId: RUN_MWYNBRY2_ACTION },
    { key: "s12", definitionId: "builtin.control.merge" },
    { key: "s13", definitionId: RUN_MWYNBRY2_ACTION },
    { key: "s14", definitionId: RUN_MWYNBRY2_ACTION }
  ] }] } } as unknown as AutomationStudioFlowBuildPlan;
  const place = (draftStep: number) => ({ step: `step ${draftStep}`, draftStep, draftStepId: `d${draftStep}` });
  const locator = { paths: {}, edges: {}, subflows: {}, rules: {}, nodes: { "0.0": place(9), "0.1": place(10), "0.2": place(10), "0.3": place(11), "0.4": place(12) } } as unknown as AutomationStudioFlowBootstrapIssueLocator;

  it("names each call's step by its plan key: never a node its statement made beside it, never a step inside a repeat", () => {
    const stamps = automationStudioAnswerFirstRunActStepStamps({ buildPlan: plan, locator, steps });
    expect(stamps.map(({ callId, step: name }) => [callId, name])).toEqual([["c8", "step:s10"], ["c9", "step:s11"]]);
    expect(stamps[1]?.forms).toEqual([{ actionId: RUN_MWYNBRY2_ACTION, parameters: { target: { handle: "t1125" } } }, { actionId: RUN_MWYNBRY2_ACTION, parameters: RUN_MWYNBRY2_RAN_WITH }]);
  });

  it("attempt 1's press, named so as its Flow is saved, refuses s11 on attempt 2's replay", async () => {
    const first = new AutomationStudioAttemptActRecord();
    first.settled({ actionId: RUN_MWYNBRY2_ACTION, parameters: { target: { handle: "t1125" } }, consequences: ["modify_existing"], stage: "exploration", callId: "c9" }, { effectApplied: true, words: { what: "+ Add", where: "On the site" }, ranWith: { parameters: RUN_MWYNBRY2_RAN_WITH } });
    expect(first.calls.stepsOf(automationStudioAnswerFirstRunActStepStamps({ buildPlan: plan, locator, steps }))).toBe(1);
    const second = new AutomationStudioAttemptActRecord({ seed: automationStudioAttemptActSeed({ data: first.data() })! });
    expect(second.data().acts[0]?.steps).toEqual(["step:s11"]);
    const { sent, s11 } = await replay(second);
    expect(sent).toEqual([]);
    expect(s11[0]).toMatchObject({ outputs: { skipped: "already_done" } });
  });
});
