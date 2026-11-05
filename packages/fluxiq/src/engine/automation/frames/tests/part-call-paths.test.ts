// Which call steps a run reached a version by: only the ones that finished it, read off the run.
import { describe, expect, it } from "vitest";
import type { AutomationStudioNodeAttemptTrace } from "../../index.ts";
import { automationStudioPartCallPaths } from "../part-call-paths.ts";

const call = (nodeId: string, target: string, status: "succeeded" | "failed", child: AutomationStudioNodeAttemptTrace[] = []): AutomationStudioNodeAttemptTrace => ({
  attemptId: `${nodeId}.${status}`,
  nodeId,
  definitionId: "builtin.control.call-subflow",
  status,
  subflowTarget: { subflowId: target, graphFlowId: `graph.${target}`, graphRevision: null },
  ...(child.length ? { childTrace: { status, attempts: child } } : {})
} as unknown as AutomationStudioNodeAttemptTrace);

describe("the call paths of a version", () => {
  const version = "part:part.shared:v1";

  it("is every step that finished it, and not a step that ran it and failed or called another", () => {
    const attempts = [call("first", version, "failed"), call("second", version, "succeeded"), call("other", "part:part.other:v1", "succeeded")];
    expect(automationStudioPartCallPaths(attempts, version)).toEqual([[{ frame: null, nodeId: "second", target: version }]]);
  });

  it("reads the same step twice as one path, as a repeat runs it", () => {
    expect(automationStudioPartCallPaths([call("each", version, "succeeded"), call("each", version, "succeeded")], version)).toHaveLength(1);
  });

  it("goes down through the frames that called it, from the run's first frame", () => {
    const attempts = [call("outer", "part:part.outer:v2", "succeeded", [call("inner", version, "succeeded")])];
    expect(automationStudioPartCallPaths(attempts, version)).toEqual([[
      { frame: null, nodeId: "outer", target: "part:part.outer:v2" },
      { frame: "part:part.outer:v2", nodeId: "inner", target: version }
    ]]);
  });

  it("is nothing for a run that never finished it", () => {
    expect(automationStudioPartCallPaths([call("only", version, "failed")], version)).toEqual([]);
  });
});
