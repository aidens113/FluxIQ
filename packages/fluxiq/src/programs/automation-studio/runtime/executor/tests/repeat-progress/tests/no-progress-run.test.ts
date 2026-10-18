// A graph run whose do-while loop makes no progress ends failed at the loop,
// naming the passes, instead of running every pass `most` allows (lane 3,
// `run-mvcvzwk1-c1d869e4`: forty passes of the same rows, about 480 s a trial).
import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../../core/index.ts";
import type { AutomationStudioFlowDocument, AutomationStudioFlowNode } from "../../../../../model/index.ts";
import { runAutomationStudioGraph, type AutomationStudioGraphExecutionOptions } from "../../../index.ts";

const edge = (sourceNodeId: string, sourcePortId: string, targetNodeId: string) => ({ id: `${sourceNodeId}.${sourcePortId}.${targetNodeId}`, sourceNodeId, sourcePortId, targetNodeId, targetPortId: "in" });
const hostStep = (id: string): AutomationStudioFlowNode => ({ id, definitionId: "builtin.policy.action", parameterValues: { outputId: `output.${id}` } });

/** start -> repeat (most 40) -> read -> onward -> repeat; repeat done -> end. */
const flow: AutomationStudioFlowDocument = {
  schemaVersion: "0.1", flowId: "flow.repeat-no-progress", ownerKind: "routine", ownerId: "routine.test", name: "Repeat", createdAt: 1, updatedAt: 1,
  nodes: [
    { id: "start", definitionId: "builtin.control.start" },
    { id: "again", definitionId: "builtin.control.repeat", parameterValues: { most: 40 } },
    hostStep("read"),
    hostStep("onward"),
    { id: "end", definitionId: "builtin.control.end" }
  ],
  edges: [edge("start", "success", "again"), edge("again", "body", "read"), edge("read", "success", "onward"), edge("onward", "success", "again"), edge("again", "done", "end")]
};

/** A host that snapshots each host step and diffs the two sides with `diff`, given how many diffs it made before. */
function options(diff: (made: number) => JsonObject): Partial<AutomationStudioGraphExecutionOptions> {
  let snapshots = 0, diffs = 0;
  return {
    maxSteps: 1_000,
    effectDispatcher: () => ({ status: "success", route: "success", outputs: { ok: true } }),
    hostRuntime: {
      capabilities: ["state-snapshot", "state-diff"],
      captureStateSnapshot: ({ node }) => {
        if (node.definitionId !== "builtin.policy.action") throw new Error("Not a host step.");
        snapshots += 1;
        return { stateSnapshotId: `state.${snapshots}`, stateRef: `state.${snapshots}`, capturedAt: snapshots, summary: { view: "same" } };
      },
      inspectStateDiff: () => diff(diffs++)
    }
  };
}
const still: JsonObject = { documentChanged: false, locationChanged: false, added: "", removed: "", addedCount: 0, removedCount: 0 };

describe("a graph run whose loop makes no progress", () => {
  it("ends failed at the loop's head before pass 4, with repeat.no_progress, when every pass stored nothing and left the host's state as it was", async () => {
    const trace = await runAutomationStudioGraph(flow, options(() => still));
    const heads = trace.attempts.filter((attempt) => attempt.nodeId === "again");
    expect(trace.status).toBe("failed");
    expect(trace.failure).toMatchObject({ code: "repeat.no_progress", retryable: false });
    expect(heads.map((attempt) => attempt.status)).toEqual(["succeeded", "succeeded", "succeeded", "failed"]);
    expect(heads.at(-1)!.failure!.actual).toContain("Passes 1 to 3 of this repeat stored no new rows and left the page as it was");
    expect(trace.attempts.at(-1)!.nodeId).toBe("again");
    expect(trace.message).toContain("stopped before pass 4");
  });

  it("runs every pass `most` allows while each pass changes what the host sees", async () => {
    const trace = await runAutomationStudioGraph(flow, options((made) => ({ ...still, added: `line ${made}`, addedCount: 1 })));
    const heads = trace.attempts.filter((attempt) => attempt.nodeId === "again");
    expect(trace.status).toBe("succeeded");
    expect(heads).toHaveLength(41);
    expect(heads.at(-1)!.route).toBe("done");
  });
});
