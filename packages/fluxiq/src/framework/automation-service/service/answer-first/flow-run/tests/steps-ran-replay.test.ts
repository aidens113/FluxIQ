// What a replay is accepted on (task speed S9): each step's closed skip reason, a check a person
// cleared, and the retries it took, read from the trace the engine really leaves where it can be.
import { describe, expect, it } from "vitest";
import { createBlankAutomationStudioFlowArtifact } from "../../../../../../flows/authoring/model/index.ts";
import type { AutomationStudioFlowBuildPlan, AutomationStudioFlowBootstrapIssueLocator } from "../../../../../../runtime/flow-authoring/bootstrap/index.ts";
import { runAutomationStudioGraph, type AutomationStudioGraphExecutionTrace, type AutomationStudioNodeAttemptTrace } from "../../../../../../engine/automation/index.ts";
import { automationStudioAnswerFirstFlowRunStepsRan } from "../steps-ran.ts";

const plan = (keys: readonly string[]): AutomationStudioFlowBuildPlan => ({ plan: { subflows: [{ key: "primary", nodes: keys.map((key) => ({ key, definitionId: "library.step" })) }] } }) as unknown as AutomationStudioFlowBuildPlan;
const locator = (keys: readonly string[]): AutomationStudioFlowBootstrapIssueLocator => ({ paths: {}, nodes: Object.fromEntries(keys.map((_, index) => [`0.${index}`, { step: "library.step", draftStep: index + 1, draftStepId: `d${index + 1}` }])), edges: {}, subflows: {}, rules: {}, lines: [] });

/** A chain start -> n1 -> n2 ... whose nodes carry the plan keys `keys`. */
function chainOf(keys: readonly string[]) {
  const chain = ["start", ...keys.map((_, index) => `n${index + 1}`)];
  return {
    ...createBlankAutomationStudioFlowArtifact({ flowId: "flow.replay", projectId: "project", name: "Replay", now: 1 }),
    nodes: [{ id: "start", definitionId: "builtin.control.start", parameterValues: { emitTimestamp: false } }, ...keys.map((key, index) => ({ id: `n${index + 1}`, definitionId: "library.step", metadata: { bootstrapSymbolicKey: key } }))],
    edges: chain.slice(1).map((target, index) => ({ id: `e${index}`, sourceNodeId: chain[index]!, targetNodeId: target, sourcePortId: "success", targetPortId: "in" }))
  };
}

/** One skipped attempt of node `n1`, as the engine stamps it. */
function skippedTrace(skipped: NonNullable<AutomationStudioNodeAttemptTrace["skipped"]>): AutomationStudioGraphExecutionTrace {
  const attempt = { attemptId: "n1.attempt.1", nodeId: "n1", definitionId: "library.step", startedAt: 1, finishedAt: 2, status: "succeeded", route: "skipped", inputs: {}, outputs: {}, effects: [], skipped } as AutomationStudioNodeAttemptTrace;
  return { status: "succeeded", startedAt: 1, finishedAt: 2, attempts: [attempt], values: {}, effects: [] } as AutomationStudioGraphExecutionTrace;
}

describe("a replayed step's record", () => {
  it("counts the retries a step took, and none for a step that ran at once", async () => {
    const keys = ["s1", "s2"];
    const graph = chainOf(keys);
    let pressed = 0;
    const trace = await runAutomationStudioGraph(graph, {
      delay: () => Promise.resolve(),
      // The first press of n1 lands nowhere, as `web.action.no_effect` reads; the retry lands.
      nativeNodeExecutor: (request) => Promise.resolve({ result: request.node.id === "n1" && (pressed += 1) === 1 ? { status: "failed", route: "failed", outputs: {}, failure: { category: "action_failed", code: "web.action.no_effect", retryable: true, stage: "execution", effect: "unacted" } } : { status: "success", route: "success", outputs: {} } })
    });
    expect(trace.status).toBe("succeeded");
    const outcome = automationStudioAnswerFirstFlowRunStepsRan({ buildPlan: plan(keys), locator: locator(keys), saved: [], ended: { reachedEnd: true, trace, graph } });
    expect(outcome.steps).toEqual([{ position: 1, ran: "passed", retries: 1 }, { position: 2, ran: "passed" }]);
  });

  it("names why each skipped step was passed over, in the closed words a replay is read by", () => {
    const keys = ["s1"];
    const graph = chainOf(keys);
    const cases: Array<[NonNullable<AutomationStudioNodeAttemptTrace["skipped"]>, string]> = [
      [{ reason: "already_done", code: "executor.act.already_done", attemptId: "earlier" }, "already_done"],
      [{ reason: "already_in_state", code: "web.state.already" }, "already_in_state"],
      [{ reason: "target_absent", code: "web.target.not_found" }, "absent"],
      [{ reason: "target_absent", code: "web.target.not_found", notDone: true }, "absent_not_done"],
      [{ reason: "target_absent", code: "executor.state.not_arisen" }, "not_arisen"],
      [{ reason: "state_routed", code: "executor.state.routed", toNodeId: "n9", direction: "forward" }, "routed_elsewhere"]
    ];
    for (const [skipped, word] of cases) {
      const outcome = automationStudioAnswerFirstFlowRunStepsRan({ buildPlan: plan(keys), locator: locator(keys), saved: [], ended: { reachedEnd: true, trace: skippedTrace(skipped), graph } });
      expect(outcome.steps[0], word).toMatchObject({ position: 1, ran: "skipped", skipped: word });
    }
  });

  it("says an act the run's own ledger already completed was already done, not that the page was elsewhere", () => {
    const outcome = automationStudioAnswerFirstFlowRunStepsRan({ buildPlan: plan(["s1"]), locator: locator(["s1"]), saved: [], ended: { reachedEnd: true, trace: skippedTrace({ reason: "already_done", code: "executor.act.already_done", attemptId: "earlier" }), graph: chainOf(["s1"]) } });
    expect(outcome.steps[0]?.happened).toBe("This was already done earlier in the task, so it was not done again.");
  });
});
