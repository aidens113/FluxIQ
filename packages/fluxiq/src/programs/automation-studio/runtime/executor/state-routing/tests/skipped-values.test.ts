import { describe, expect, it } from "vitest";
import type { AutomationStudioFlowDocument, AutomationStudioFlowNode } from "../../../../model/index.ts";
import type { AutomationStudioNodeAttemptTrace } from "../../contracts.ts";
import { automationStudioUnboundSkippedValue } from "../index.ts";

const node = (id: string, parameterValues: AutomationStudioFlowNode["parameterValues"] = {}, definitionId = "web.unregistered.press"): AutomationStudioFlowNode => ({ id, definitionId, parameterValues });
const bind = (path: string) => ({ $state: { path } });
const edge = (from: string, to: string) => ({ id: `${from}.${to}`, sourceNodeId: from, sourcePortId: "success", targetNodeId: to });
const flowOf = (nodes: AutomationStudioFlowNode[]): AutomationStudioFlowDocument => ({
  schemaVersion: "0.1", flowId: "flow.skipped", ownerKind: "routine", ownerId: "routine.test", name: "Skipped", createdAt: 1, updatedAt: 1,
  nodes, edges: nodes.slice(1).map((next, index) => edge(nodes[index]!.id, next.id))
});
const ran = (nodeId: string, outputs: AutomationStudioNodeAttemptTrace["outputs"]): AutomationStudioNodeAttemptTrace => ({ attemptId: `${nodeId}.attempt.1`, nodeId, definitionId: "web.unregistered.press", startedAt: 1, status: "succeeded", route: "success", inputs: {}, outputs, effects: [] });

describe("a value a forward route would leave unset", () => {
  // a -> b -> c -> d -> e; b cannot run and the page matches d.
  it("names a step passed over whose value a step on the route's path reads", () => {
    const flow = flowOf([node("a"), node("b"), node("c"), node("d"), node("e", { query: bind("c.text") })]);
    expect(automationStudioUnboundSkippedValue({ flow, fromNodeId: "b", toNodeId: "d", attempts: [], inputs: undefined })).toEqual({ producerNodeId: "c", readerNodeId: "e", path: "c.text" });
  });

  it("counts the failing step itself as passed over, and the target as a reader", () => {
    const flow = flowOf([node("a"), node("b"), node("c"), node("d", { query: bind("b.choice") })]);
    expect(automationStudioUnboundSkippedValue({ flow, fromNodeId: "b", toNodeId: "d", attempts: [], inputs: undefined })).toEqual({ producerNodeId: "b", readerNodeId: "d", path: "b.choice" });
  });

  it("finds none when nothing on the route's path reads a step passed over", () => {
    const flow = flowOf([node("a", { query: bind("c.text") }), node("b"), node("c"), node("d"), node("e", { query: bind("a.text") })]);
    expect(automationStudioUnboundSkippedValue({ flow, fromNodeId: "b", toNodeId: "d", attempts: [], inputs: undefined })).toBeUndefined();
  });

  it("finds none when the value is already set, by an earlier pass or by the run's inputs", () => {
    const flow = flowOf([node("a"), node("b"), node("c"), node("d"), node("e", { query: bind("c.text"), rows: bind("c.records.0") })]);
    expect(automationStudioUnboundSkippedValue({ flow, fromNodeId: "b", toNodeId: "d", attempts: [ran("c", { text: "x", records: [] })], inputs: undefined })).toBeUndefined();
    expect(automationStudioUnboundSkippedValue({ flow, fromNodeId: "b", toNodeId: "d", attempts: [], inputs: { "c.text": "x", "c.records": [] } })).toBeUndefined();
  });

  it("reads a registered step's bare output ids, and only by id an unregistered step's", () => {
    const registered = flowOf([node("a"), node("b"), node("c", {}, "builtin.policy.action"), node("d", { rows: bind("records") })]);
    expect(automationStudioUnboundSkippedValue({ flow: registered, fromNodeId: "b", toNodeId: "d", attempts: [], inputs: undefined })).toEqual({ producerNodeId: "c", readerNodeId: "d", path: "records" });
    const unregistered = flowOf([node("a"), node("b"), node("c"), node("d", { rows: bind("records") })]);
    expect(automationStudioUnboundSkippedValue({ flow: unregistered, fromNodeId: "b", toNodeId: "d", attempts: [], inputs: undefined })).toBeUndefined();
  });

  it("counts a data edge from a step passed over into the route's path", () => {
    const flow = flowOf([node("a"), node("b"), node("c"), node("d")]);
    flow.edges.push({ id: "data", sourceNodeId: "c", sourcePortId: "rows", targetNodeId: "d", targetPortId: "items" });
    expect(automationStudioUnboundSkippedValue({ flow, fromNodeId: "b", toNodeId: "d", attempts: [], inputs: undefined })).toEqual({ producerNodeId: "c", readerNodeId: "d", path: "c.rows" });
  });
});
