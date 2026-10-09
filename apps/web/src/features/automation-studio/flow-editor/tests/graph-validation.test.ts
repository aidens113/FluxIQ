import type { Edge, Node } from "@xyflow/react";
import { describe, expect, it } from "vitest";
import { automationFlowGraphProblems, type AutomationGraphValidationContext } from "../graph-validation";
import type { AutomationFlowNodeData } from "../node-types";
import type { JsonObject } from "../../../programs/program-api";

const anyPort = (id: string) => ({ id, label: id, valueType: "any" as const });
const EVENT_OPTIONS = ["start", "before", "retry", "fail", "before_next"].map((value) => ({ label: "Runs " + value, value }));
const DISPOSITION_OPTIONS = ["resume", "route", "resolve", "unhandled"].map((value) => ({ label: "Then " + value, value }));

function node(id: string, nodeDefinitionId: string, extra: Partial<AutomationFlowNodeData> = {}): Node<AutomationFlowNodeData> {
  return {
    id,
    position: { x: 0, y: 0 },
    data: {
      nodeDefinitionId,
      label: id,
      description: "",
      actionTypes: [],
      recovery: "",
      evidenceCount: 0,
      readinessCount: 0,
      successCount: 0,
      inputs: [anyPort("in"), anyPort("total")],
      outputs: [anyPort("success"), anyPort("failed"), anyPort("body"), anyPort("total"), anyPort("next")],
      parameters: [],
      parameterValues: {},
      isStart: nodeDefinitionId === "builtin.control.start",
      ...extra
    }
  };
}

const edge = (id: string, source: string, target: string, sourceHandle = "success", targetHandle = "in"): Edge => ({ id, source, target, sourceHandle, targetHandle });

function graph(handler: JsonObject, end: JsonObject, extra: { nodes?: Array<Node<AutomationFlowNodeData>>; edges?: Edge[] } = {}) {
  const nodes = [
    node("start", "builtin.control.start"),
    node("press", "web.press"),
    node("read", "web.read", { metadata: { "fluxiq.checkpoint": { id: "before-read" } } }),
    node("h", "builtin.control.handler", { parameters: [{ id: "event", label: "Runs at", valueType: "string", options: EVENT_OPTIONS }], parameterValues: handler }),
    node("h-step", "web.press"),
    node("h-end", "builtin.control.handler-end", { parameters: [{ id: "disposition", label: "Then", valueType: "string", options: DISPOSITION_OPTIONS }], parameterValues: end }),
    ...(extra.nodes ?? [])
  ];
  const edges = [
    edge("e1", "start", "press", "next"),
    edge("e2", "press", "read"),
    edge("e3", "press", "read", "total", "total"),
    edge("e5", "h", "h-step", "body"),
    edge("e6", "h-step", "h-end"),
    ...(extra.edges ?? [])
  ];
  return { nodes, edges };
}

function ids(input: { nodes: Array<Node<AutomationFlowNodeData>>; edges: Edge[] }, context?: AutomationGraphValidationContext): string[] {
  return automationFlowGraphProblems(input.nodes, input.edges, context).map((problem) => problem.id);
}

const onFail = (scope: JsonObject = { kind: "nodes", nodeIds: ["press"] }): JsonObject => ({ event: "fail", scope });

describe("flow editor validation of lifecycle handlers", () => {
  it("accepts a well-formed handler and does not report the handler or its body unreachable", () => {
    expect(ids(graph(onFail(), { disposition: "route", checkpointId: "before-read" }))).toEqual([]);
  });

  it("still reports any other node no route enters, but not entries or interference clearers", () => {
    const input = graph(onFail(), { disposition: "unhandled" }, {
      nodes: [node("orphan", "web.press"), node("entry", "web.read", { metadata: { "fluxiq.entry": { id: "e" } } }), node("dismiss", "web.press", { metadata: { clearsInterference: true } })]
    });
    expect(ids(input)).toEqual(["unreachable:orphan"]);
  });

  it("refuses an unknown event and a malformed or outside scope", () => {
    expect(ids(graph({ event: "whenever", scope: { kind: "subflow" } }, { disposition: "unhandled" }))).toContain("handler:unknown_event:h");
    expect(ids(graph(onFail({ kind: "anywhere" }), { disposition: "unhandled" }))).toContain("handler:invalid_scope:h");
    expect(ids(graph(onFail({ kind: "nodes", nodeIds: ["gone"] }), { disposition: "unhandled" }))).toContain("handler:scope_node_outside_graph:h");
  });

  it("refuses automation scope outside the recovery part", () => {
    const input = graph(onFail({ kind: "automation" }), { disposition: "unhandled" });
    expect(ids(input)).toContain("handler:automation_scope_outside_recovery:h");
    expect(ids(input, { subflowRole: "recovery" })).not.toContain("handler:automation_scope_outside_recovery:h");
  });

  it("refuses a body without a Handler End and a handler inside a body", () => {
    const open = graph(onFail(), { disposition: "unhandled" });
    open.edges = open.edges.filter((entry) => entry.id !== "e6");
    expect(ids(open)).toContain("handler:body_without_end:h");
    const nested = graph(onFail(), { disposition: "unhandled" }, {
      nodes: [node("nested", "builtin.control.handler", { parameterValues: onFail() })],
      edges: [edge("e7", "h-step", "nested"), edge("e8", "nested", "h-end", "body")]
    });
    expect(ids(nested)).toContain("handler:handler_inside_body:h");
  });

  it("refuses a route to an unknown checkpoint and a resolve that misses required outputs", () => {
    const route = graph(onFail(), { disposition: "route", checkpointId: "nowhere" });
    expect(ids(route)).toContain("handler:unknown_checkpoint:h-end");
    expect(ids(route, { externalCheckpointIds: ["nowhere"] })).not.toContain("handler:unknown_checkpoint:h-end");
    expect(ids(graph(onFail(), { disposition: "resolve", outputs: {} }))).toContain("handler:resolve_missing_outputs:h-end");
    expect(ids(graph(onFail(), { disposition: "resolve", outputs: { total: 1 } }))).toEqual([]);
  });

  it("refuses a before or retry handler without a completion check, and dispositions the event does not allow", () => {
    expect(ids(graph({ event: "retry", scope: { kind: "subflow" } }, { disposition: "resume" }))).toContain("handler:missing_completion_check:h");
    expect(ids(graph({ event: "retry", scope: { kind: "subflow" }, completionCheck: [{ fact: "f", op: "absent" }] }, { disposition: "resume" }))).toEqual([]);
    expect(ids(graph(onFail(), { disposition: "resume" }))).toContain("handler:disposition_not_allowed:h-end");
    expect(ids(graph({ event: "before_next", scope: { kind: "subflow" } }, { disposition: "resolve", outputs: {} }))).toContain("handler:disposition_not_allowed:h-end");
    expect(ids(graph(onFail(), { disposition: "explode" }))).toContain("handler:unknown_disposition:h-end");
  });
});
