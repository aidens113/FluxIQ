import { describe, expect, it } from "vitest";
import { isAutomationSubflowGraph, isAutomationTopLevelFlow } from "./flow-ownership";

describe("Automation Flow ownership", () => {
  it("requires the Core representation marker and complete Subflow ownership triple", () => {
    const valid = {
      flowId: "flow.child.graph",
      metadata: {
        flowRepresentationVersion: 1,
        flowRepresentationKind: "subflow_graph",
        subflowGraph: true,
        parentFlowId: "flow.parent",
        parentSubflowId: "subflow.child"
      }
    };
    expect(isAutomationSubflowGraph(valid)).toBe(true);
    expect(isAutomationTopLevelFlow(valid)).toBe(false);
    expect(isAutomationSubflowGraph({ ...valid, metadata: { ...valid.metadata, flowRepresentationKind: "orchestration" } })).toBe(false);
    expect(isAutomationSubflowGraph({ ...valid, metadata: { ...valid.metadata, parentSubflowId: "" } })).toBe(false);
  });
});
