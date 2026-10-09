import { describe, expect, it } from "vitest";
import { AUTOMATION_STUDIO_FRAME_PHASES, type AutomationStudioFrameStack } from "../index.ts";

describe("invocation frames", () => {
  it("names the five cursor phases of C1", () => {
    expect([...AUTOMATION_STUDIO_FRAME_PHASES]).toEqual(["before_attempt", "before_retry", "before_next", "failed", "handler"]);
  });

  it("is plain JSON data a trace and a later persistence can carry, outermost first", () => {
    const stack: AutomationStudioFrameStack = [
      { invocationId: "inv-1", subflowId: "s-main", graphFlowId: "g-main", graphRevision: 4, entry: { kind: "default" }, inputs: { query: "x" }, outputs: {}, cursor: { nodeId: "call", phase: "before_attempt" } },
      { invocationId: "inv-2", parentInvocationId: "inv-1", callNodeId: "call", subflowId: "s-child", graphFlowId: "g-child", graphRevision: null, entry: { kind: "checkpoint", id: "cart" }, inputs: {}, outputs: {}, cursor: { nodeId: "press", phase: "failed" }, incidentId: "inc-1" }
    ];
    expect(JSON.parse(JSON.stringify(stack))).toEqual(stack);
    expect(stack.map((frame) => frame.invocationId)).toEqual(["inv-1", "inv-2"]);
  });
});
