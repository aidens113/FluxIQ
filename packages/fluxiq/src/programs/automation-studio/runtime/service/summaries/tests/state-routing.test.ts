import { describe, expect, it } from "vitest";
import type { AutomationStudioFlowDocument, AutomationStudioRuntimeSession } from "../../../../model/index.ts";
import type { AutomationStudioNodeAttemptTrace } from "../../../executor/index.ts";
import { automationStudioRunDetailStateRouting, runtimeSessionToFlowRunDetail } from "../index.ts";

// t250: the routing record of every consulted attempt reaches the run detail,
// as closed words and node ids, so a step whose routing found no way on is
// told from one that never consulted the page, and a step passed over because
// the page already showed its effect from one routed by a starting page.
const notFound = { category: "target_not_found", code: "web.target.not_found", retryable: false, stage: "target_resolution" } as const;

describe("runtimeSessionToFlowRunDetail state routing", () => {
  it("carries a failed step's no_match, unobserved and no_pre_states with the code that asked, never the reason or counts", () => {
    for (const outcome of ["no_match", "unobserved", "no_pre_states"]) {
      const record = project(consulted({ outcome, candidates: 3, matched: 0, reason: "The page said “Sold out”." }));
      expect(record?.stateRouting).toEqual({ outcome, code: "web.target.not_found" });
      expect(JSON.stringify(record)).not.toContain("Sold out");
    }
  });

  it("names the readiness gate's code when the gate asked, whatever the dispatched attempt then did", () => {
    const readiness = { ceilingMs: 5000, waitedMs: 5000, satisfied: false, checkedConditionCount: 2 };
    const succeeded = { ...attempt("succeeded"), readiness, stateRouting: { outcome: "no_match", candidates: 1, matched: 0 } } as AutomationStudioNodeAttemptTrace;
    expect(project(succeeded)?.stateRouting).toEqual({ outcome: "no_match", code: "executor.ready_state.not_shown" });
  });

  it("carries guard_stopped with the node it would have returned to", () => {
    expect(project(consulted({ outcome: "guard_stopped", candidates: 2, matched: 1, toNodeId: "cart", direction: "backward", reason: "loop" }))?.stateRouting)
      .toEqual({ outcome: "guard_stopped", code: "web.target.not_found", toNodeId: "cart" });
  });

  it("tells effect_holds from routed on a passed-over step, leaving where it went to skipped", () => {
    for (const outcome of ["effect_holds", "routed"]) {
      const routed = {
        ...attempt("succeeded"),
        route: "state_routed",
        skipped: { reason: "state_routed", code: "web.target.not_found", toNodeId: "checkout", direction: "forward" },
        stateRouting: { outcome, candidates: 2, matched: 1, toNodeId: "checkout", direction: "forward", closeness: 0.9 }
      } as AutomationStudioNodeAttemptTrace;
      const record = project(routed);
      expect(record?.stateRouting).toEqual({ outcome });
      expect(record?.skipped).toEqual({ reason: "state_routed", code: "web.target.not_found", toNodeId: "checkout", direction: "forward" });
    }
  });

  it("drops a code not in Core's shape, an unknown outcome, and a guard stop without a node", () => {
    const pageWords = { ...consulted({ outcome: "no_match", candidates: 0, matched: 0 }), failure: { ...notFound, code: "Sold out now" } } as AutomationStudioNodeAttemptTrace;
    expect(automationStudioRunDetailStateRouting(pageWords, "Sold out now")).toEqual({ outcome: "no_match" });
    expect(project(consulted({ outcome: "teleported", candidates: 0, matched: 0 }))).not.toHaveProperty("stateRouting");
    expect(project(consulted({ outcome: "guard_stopped", candidates: 1, matched: 1 }))).not.toHaveProperty("stateRouting");
    expect(project(consulted({ outcome: "guard_stopped", candidates: 1, matched: 1, toNodeId: "a node with spaces" }))).not.toHaveProperty("stateRouting");
  });

  it("writes no stateRouting for an attempt that never consulted the page", () => {
    expect(project({ ...attempt("failed"), failure: notFound } as AutomationStudioNodeAttemptTrace)).not.toHaveProperty("stateRouting");
    expect(project(attempt("succeeded"))).not.toHaveProperty("stateRouting");
  });
});

function attempt(status: "succeeded" | "failed"): AutomationStudioNodeAttemptTrace {
  return { attemptId: "node.action.attempt.1", nodeId: "node.action", definitionId: "builtin.policy.action", startedAt: 10, finishedAt: 15, status, route: status === "failed" ? "failed" : "success", inputs: {}, outputs: {}, effects: [] };
}

function consulted(stateRouting: object): AutomationStudioNodeAttemptTrace {
  return { ...attempt("failed"), failure: notFound, stateRouting } as AutomationStudioNodeAttemptTrace;
}

function project(item: AutomationStudioNodeAttemptTrace) {
  return runtimeSessionToFlowRunDetail(session([item]), "project.state-routing").actionAttempts?.[0];
}

function session(attempts: AutomationStudioNodeAttemptTrace[]): AutomationStudioRuntimeSession {
  return {
    schemaVersion: "0.1",
    runId: "run.state-routing",
    projectId: "project.state-routing",
    targetKind: "flow",
    targetId: "flow.state-routing",
    flowId: "flow.state-routing",
    status: "failed",
    queuedAt: 1,
    startedAt: 5,
    finishedAt: 20,
    // The conversion never reads the Flow document.
    flow: {} as AutomationStudioFlowDocument,
    trace: { status: "failed", startedAt: 5, finishedAt: 20, attempts, values: {}, effects: [] }
  };
}
