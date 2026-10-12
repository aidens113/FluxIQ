// A run stopped as Outcome uncertain carries a closed stop code on its trace,
// `run.outcome_uncertain` (`../uncertain-stop.ts`), beside the sentence for
// people, while the failed attempt keeps its own failure: the timeout says how
// the act went wrong, the stop code why the run ended there (matrix row 9).

import type { AutomationStudioFailureRecord } from "@fluxiq/contracts/automation-studio";
import { describe, expect, it } from "vitest";
import type { AutomationStudioFlowDocument, AutomationStudioFlowNode } from "../../../../model/index.ts";
import type { AutomationStudioGraphExecutionOptions } from "../../contracts.ts";
import { runAutomationStudioGraph } from "../../graph-run.ts";

/** A committing press whose answer never came back in time. */
const TIMED_OUT: AutomationStudioFailureRecord = { category: "timeout", code: "web.action.timeout", retryable: true, stage: "execution", effect: "ambiguous" };

function press(id: string, metadata?: AutomationStudioFlowNode["metadata"]): AutomationStudioFlowNode {
  return { id, definitionId: "builtin.policy.action", parameterValues: { outputId: "activate-element", parameters: { elementId: id } }, ...(metadata ? { metadata } : {}) };
}

function line(nodes: AutomationStudioFlowNode[]): AutomationStudioFlowDocument {
  const all = [{ id: "start", definitionId: "builtin.control.start" }, ...nodes, { id: "done", definitionId: "builtin.control.end" }];
  const edges = all.slice(1).map((node, index) => ({ id: `e${index}`, sourceNodeId: all[index]!.id, targetNodeId: node.id, sourcePortId: "success", targetPortId: "in" }));
  return { schemaVersion: "0.1", flowId: "flow.uncertain", ownerKind: "routine", ownerId: "routine.uncertain", name: "Uncertain", createdAt: 1, updatedAt: 1, nodes: all, edges };
}

function options(pressed: string[], failing: Record<string, AutomationStudioFailureRecord>): AutomationStudioGraphExecutionOptions {
  return {
    delay: async () => undefined,
    now: () => 1_000,
    hostRuntime: { capabilities: [] },
    effectDispatcher: (effect) => {
      const id = /"elementId":"([^"]+)"/u.exec(JSON.stringify(effect.payload ?? null))?.[1] ?? "?";
      pressed.push(id);
      const failure = failing[id];
      if (failure) return { status: "failed", route: "failed", message: "No answer came back in time.", failure };
      return { status: "success", route: "success", outputs: { ok: true } };
    }
  };
}

describe("the Outcome uncertain stop", () => {
  it("ends a lasting act that timed out with no way to tell whether it landed with `run.outcome_uncertain`, and keeps the sentence", async () => {
    const pressed: string[] = [];
    const trace = await runAutomationStudioGraph(line([press("place-order", { declaredConsequences: ["create_new"] }), press("next")]), options(pressed, { "place-order": TIMED_OUT }));

    expect(pressed).toEqual(["place-order"]);
    expect(trace.status).toBe("failed");
    expect(trace.failure).toEqual({ category: "ambiguous_or_unknown", code: "run.outcome_uncertain", retryable: false, stage: "confirmation", effect: "ambiguous" });
    expect(trace.message).toMatch(/^Outcome uncertain: /u);
    // The attempt keeps how the act itself went wrong.
    expect(trace.attempts.find((attempt) => attempt.nodeId === "place-order")?.failure).toMatchObject({ category: "timeout", code: "web.action.timeout" });
  });

  it("puts no stop code on a run that failed any other way", async () => {
    const pressed: string[] = [];
    const refused: AutomationStudioFailureRecord = { category: "unexpected_state", code: "web.step.refused", retryable: false, stage: "execution", effect: "unacted" };
    const trace = await runAutomationStudioGraph(line([press("open"), press("next")]), options(pressed, { open: refused }));

    expect(trace.status).toBe("failed");
    expect(trace.failure).toBeUndefined();
    expect(trace.message ?? "").not.toMatch(/^Outcome uncertain/u);
  });
});
