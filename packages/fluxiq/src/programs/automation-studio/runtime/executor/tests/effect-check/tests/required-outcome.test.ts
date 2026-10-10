// A required-mode run whose command's outcome stayed unknown (t427): its
// command ledger latched the run, so whatever the page shows the run stops
// there as Outcome uncertain, the act is never pressed again and no checkpoint
// is asked; the page's effect check runs only to say what the page showed, and
// the trace keeps its result.

import { describe, expect, it } from "vitest";
import { ClientGatewayCommandContext } from "../../../../../../../client-gateway/service/command-ledger/index.ts";
import type { JsonObject } from "../../../../../../../core/index.ts";
import type { AutomationStudioFlowDocument, AutomationStudioFlowEdge, AutomationStudioFlowNode } from "../../../../../model/index.ts";
import type { AutomationNodeExpectationEvaluation } from "../../../../../nodes/index.ts";
import type { AutomationStudioHostRuntimeBoundary } from "../../../../host-runtime.ts";
import type { AutomationStudioExecutorCommandRun } from "../../../command-scope/index.ts";
import { runAutomationStudioGraph, type AutomationStudioGraphExecutionOptions } from "../../../index.ts";

const CART_HOLDS: JsonObject = { conditions: [{ fact: "cart", op: "exists" }], mode: "all" };

function press(id: string, parameters: JsonObject = {}): AutomationStudioFlowNode {
  return { id, definitionId: "builtin.policy.action", parameterValues: { outputId: "activate-element", parameters: { elementId: id }, ...parameters } };
}

function edge(sourceNodeId: string, targetNodeId: string, sourcePortId = "success"): AutomationStudioFlowEdge {
  return { id: `${sourceNodeId}.${sourcePortId}.${targetNodeId}`, sourceNodeId, targetNodeId, sourcePortId, targetPortId: "in" };
}

/** start -> add -> next -> done, with a failed route from add to `fallback` that the stop must not take. */
function flow(add: AutomationStudioFlowNode): AutomationStudioFlowDocument {
  const main = [{ id: "start", definitionId: "builtin.control.start" }, add, press("next"), { id: "done", definitionId: "builtin.control.end" }];
  const edges = [...main.slice(1).map((node, index) => edge(main[index]!.id, node.id)), edge("add", "fallback", "failed")];
  return { schemaVersion: "0.1", flowId: "flow.required-outcome", ownerKind: "routine", ownerId: "routine.required-outcome", name: "Required outcome", createdAt: 1, updatedAt: 1, nodes: [...main, press("fallback")], edges };
}

type Run = { presses: string[]; checkpointsAfterLatch: number; consumed: number; latched: boolean };

/**
 * A command run whose first command's outcome stays unknown: from then on it is
 * latched, as the real one is (`service/command-run/controller.ts`), and every
 * checkpoint or consumption refuses. Commands before that are receipted.
 */
function requiredRun(run: Run): AutomationStudioExecutorCommandRun {
  const unreceipted = new WeakSet<object>();
  const abort = new AbortController();
  return {
    signal: abort.signal,
    acceptsComposite: () => false,
    own: (start) => start(),
    checkpoint: async () => {
      if (!run.latched) return;
      run.checkpointsAfterLatch += 1;
      throw new Error("command_run.outcome_unknown");
    },
    context: async (_consumer, ordinal) => {
      const context = ClientGatewayCommandContext.issue({ projectId: "project.1", runId: "run.1", flowId: "flow.required-outcome", invocationId: "invoke.1", attemptId: `attempt.${run.presses.length}`, effectOrdinal: ordinal });
      return { capability: {}, context };
    },
    consume: async (_consumer, _capability, context) => {
      if (run.latched || unreceipted.has(context)) throw new Error("command_run.outcome_unknown");
      run.consumed += 1;
    },
    stop: async () => undefined,
    receipted: (context) => {
      if (run.latched) unreceipted.add(context);
      return !run.latched;
    }
  };
}

/** `add`'s answer never comes; the page shows the cart when `landed`, and judges nothing when `judges` is false. */
function options(run: Run, page: { landed: boolean; judges: boolean }): AutomationStudioGraphExecutionOptions {
  const host: AutomationStudioHostRuntimeBoundary = {
    capabilities: [],
    expectationEvaluator: (): AutomationNodeExpectationEvaluation => (page.judges ? { passed: page.landed, checkedConditionCount: 1 } : { passed: false, checkedConditionCount: 0 })
  };
  return {
    delay: async () => undefined,
    now: () => 1_000,
    currentSubflowId: "main",
    hostRuntime: host,
    commandRun: requiredRun(run),
    effectDispatcher: (effect) => {
      const id = /"elementId":"([^"]+)"/u.exec(JSON.stringify(effect.payload ?? null))?.[1] ?? "?";
      run.presses.push(id);
      if (id !== "add") return { status: "success", route: "success", outputs: { ok: true } };
      // The ledger called the outcome unknown and latched the run; the domain reports it as such.
      run.latched = true;
      return { status: "failed", route: "failed", message: "No answer came for this action.", failure: { category: "ambiguous_or_unknown", code: "web.action.unknown", retryable: false, stage: "execution", effect: "ambiguous" } };
    }
  };
}

function newRun(): Run {
  return { presses: [], checkpointsAfterLatch: 0, consumed: 0, latched: false };
}

describe("a required run whose command's outcome stays unknown", () => {
  it.each([
    ["landed", { landed: true, judges: true }, "The page shows the step took effect"],
    ["not_landed", { landed: false, judges: true }, "The page shows the step did not take effect"],
    ["unknown", { landed: false, judges: false }, "Nothing on the page shows whether the step took effect"]
  ] as const)("page check %s: stops uncertain, never presses again, and keeps the check on the trace", async (result, page, words) => {
    const run = newRun();
    const trace = await runAutomationStudioGraph(flow(press("add", { expectedState: CART_HOLDS })), options(run, page));

    expect(trace.status).toBe("failed");
    expect(trace.failure).toMatchObject({ code: "run.outcome_uncertain" });
    expect(trace.message).toContain("Outcome uncertain:");
    expect(trace.message).toContain(words);
    expect(run.presses).toEqual(["add"]);
    expect(run.checkpointsAfterLatch).toBe(0);
    const add = trace.attempts.filter((attempt) => attempt.nodeId === "add");
    expect(add).toHaveLength(1);
    expect(add[0]).toMatchObject({ status: "failed", failure: { code: "executor.required_outcome_unknown" }, effectCheck: { result } });
    expect(add[0]?.stateHeld).toBeUndefined();
    expect(add[0]?.recoveryDecision).toBeUndefined();
  });

  it("consumes the receipted commands before it, and only those", async () => {
    const run = newRun();
    const document = flow(press("add", { expectedState: CART_HOLDS }));
    const first = press("first");
    document.nodes.push(first);
    document.edges = document.edges.map((item) => (item.sourceNodeId === "start" ? edge("start", "first") : item));
    document.edges.push(edge("first", "add"));
    const trace = await runAutomationStudioGraph(document, options(run, { landed: true, judges: true }));

    expect(run.presses).toEqual(["first", "add"]);
    expect(run.consumed).toBe(1);
    expect(trace.failure).toMatchObject({ code: "run.outcome_uncertain" });
    expect(trace.attempts.find((attempt) => attempt.nodeId === "first")).toMatchObject({ status: "succeeded" });
  });
});
