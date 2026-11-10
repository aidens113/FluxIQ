// A sometimes-present step whose control the page does not show is passed over at once (task speed
// S10, `../optional-not-shown.ts`). Pinned: only a positive "not shown" from the host passes it over,
// and then nothing is dispatched for it; any other answer, or a step that cannot be asked about, runs
// it exactly as before.

import { describe, expect, it } from "vitest";
import type { AutomationStudioFlowDocument } from "../../tests/fixture-contracts.ts";
import type { AutomationStudioFlowNode } from "../../../../flows/executable/graph/index.ts";
import type { AutomationStudioFactCondition } from "../../../../runtime/automation-host/contracts/index.ts";
import { runAutomationStudioGraph, type AutomationStudioGraphExecutionOptions } from "../../index.ts";
import { automationStudioOptionalStepNotShown } from "../index.ts";

type Host = NonNullable<AutomationStudioGraphExecutionOptions["hostRuntime"]>;
type Truth = "true" | "false" | "unknown";

const press = (id: string, elementId: string): AutomationStudioFlowNode => ({ id, definitionId: "builtin.policy.action", parameterValues: { outputId: "activate-element", parameters: { elementId } } });

/** search -> check (optional: success and failed both reach the Merge) -> join -> read: the shape a build writes for a dismissed prompt. */
const flow: AutomationStudioFlowDocument = {
  schemaVersion: "0.1", flowId: "flow.optional-prompt", ownerKind: "routine", ownerId: "routine.test", name: "Optional prompt", createdAt: 1, updatedAt: 1,
  nodes: [press("search", "search"), press("check", "prompt-close"), { id: "join", definitionId: "builtin.control.merge", parameterValues: { mergeMode: "first" } }, press("read", "results")],
  edges: [
    { id: "search.check", sourceNodeId: "search", sourcePortId: "success", targetNodeId: "check", targetPortId: "in" },
    { id: "check.failed", sourceNodeId: "check", sourcePortId: "failed", targetNodeId: "join", targetPortId: "in" },
    { id: "check.success", sourceNodeId: "check", sourcePortId: "success", targetNodeId: "join", targetPortId: "branches" },
    { id: "join.read", sourceNodeId: "join", sourcePortId: "success", targetNodeId: "read", targetPortId: "in" }
  ]
};
const node = (id: string) => flow.nodes.find((entry) => entry.id === id)!;

/** A host whose one fact answers `truth` for the prompt's control and `true` for any other, counting what it is asked. */
function host(truth: Truth | "throws" | "none"): { host: Host; asked: AutomationStudioFactCondition[][] } {
  const asked: AutomationStudioFactCondition[][] = [];
  const base: Host = { capabilities: [] };
  if (truth === "none") return { host: base, asked };
  return {
    asked,
    host: {
      ...base,
      factEvaluator: (conditions) => {
        asked.push([...conditions]);
        if (truth === "throws") throw new Error("the page could not be read");
        return conditions.map((condition) => ({ result: JSON.stringify(condition.target).includes("prompt-close") ? truth : "true", capturedAt: 1 }));
      }
    }
  };
}

/** Every dispatch, by the element its payload names; the prompt's press fails as an absent target does, after the host's own wait. */
function dispatcher() {
  const sent: string[] = [];
  const dispatch: NonNullable<AutomationStudioGraphExecutionOptions["effectDispatcher"]> = (effect) => {
    const payload = JSON.stringify(effect.payload ?? null);
    sent.push(payload.includes("prompt-close") ? "prompt-close" : payload.includes("search") ? "search" : "results");
    return payload.includes("prompt-close")
      ? { status: "failed", route: "failed", message: "No target resolved.", failure: { category: "target_not_found", code: "web.target.not_found", retryable: true, stage: "target_resolution" } }
      : { status: "success", route: "success", outputs: { ok: true } };
  };
  return { sent, dispatch };
}

describe("whether a sometimes-present step's control is shown, asked before it is dispatched", () => {
  it("passes it over on a positive not-shown, asking once with the step's own parameters as the target", async () => {
    const { host: hostRuntime, asked } = host("false");
    const read = await automationStudioOptionalStepNotShown({ flow, node: node("check"), values: {}, options: { hostRuntime }, attemptId: "check.attempt.1" });
    expect(read).toMatchObject({ kind: "not_shown", readiness: { satisfied: false, checkedConditionCount: 1, ceilingMs: 0 } });
    expect(asked).toEqual([[{ fact: "visible", op: "visible", target: node("check").parameterValues }]]);
  });

  it("does not pass it over on any other answer", async () => {
    for (const truth of ["true", "unknown", "throws", "none"] as const) {
      const read = await automationStudioOptionalStepNotShown({ flow, node: node("check"), values: {}, options: { hostRuntime: host(truth).host }, attemptId: "check.attempt.1" });
      expect(read.kind, truth).toBe("asked");
    }
  });

  it("asks nothing of a step that is not optional, has no target, or is bound to a value the run does not hold", async () => {
    const { host: hostRuntime, asked } = host("false");
    const ask = (step: AutomationStudioFlowNode, inFlow: AutomationStudioFlowDocument = flow) => automationStudioOptionalStepNotShown({ flow: inFlow, node: step, values: {}, options: { hostRuntime }, attemptId: "x" });
    expect(await ask(node("search"))).toEqual({ kind: "not_asked", why: "not_optional" });
    const bare = { ...node("check"), parameterValues: {} };
    expect(await ask(bare, { ...flow, nodes: flow.nodes.map((entry) => entry.id === "check" ? bare : entry) })).toEqual({ kind: "not_asked", why: "no_target" });
    const bound = { ...node("check"), parameterValues: { outputId: "activate-element", parameters: { elementId: { $state: { path: "row.closeId" } } } } };
    expect(await ask(bound, { ...flow, nodes: flow.nodes.map((entry) => entry.id === "check" ? bound : entry) })).toEqual({ kind: "not_asked", why: "unbound_target" });
    expect(asked).toEqual([]);
  });
});

describe("a run past a prompt that is not there", () => {
  it("never dispatches the prompt's press when the host says its control is not shown", async () => {
    const { sent, dispatch } = dispatcher();
    const trace = await runAutomationStudioGraph(flow, { effectDispatcher: dispatch, hostRuntime: host("false").host, delay: async () => undefined });
    expect(trace.status).toBe("succeeded");
    expect(sent).toEqual(["search", "results"]);
    expect(trace.attempts.map((attempt) => attempt.nodeId)).toEqual(["search", "check", "join", "read"]);
    expect(trace.attempts[1]).toMatchObject({ status: "succeeded", route: "skipped", skipped: { reason: "target_absent" }, readiness: { satisfied: false, checkedConditionCount: 1 } });
    expect(trace.attempts[1]).not.toHaveProperty("recoveryDecision");
  });

  it("dispatches it as before when the host cannot say, and still passes it over once it answers absent", async () => {
    for (const truth of ["unknown", "none"] as const) {
      const { sent, dispatch } = dispatcher();
      const trace = await runAutomationStudioGraph(flow, { effectDispatcher: dispatch, hostRuntime: host(truth).host, delay: async () => undefined });
      expect(trace.status, truth).toBe("succeeded");
      expect(sent, truth).toEqual(["search", "prompt-close", "results"]);
      expect(trace.attempts[1], truth).toMatchObject({ route: "skipped", skipped: { reason: "target_absent", code: "web.target.not_found" } });
    }
  });

  it("dispatches it when its control is shown", async () => {
    const { sent, dispatch } = dispatcher();
    await runAutomationStudioGraph(flow, { effectDispatcher: dispatch, hostRuntime: host("true").host, delay: async () => undefined });
    expect(sent).toEqual(["search", "prompt-close", "results"]);
  });
});
