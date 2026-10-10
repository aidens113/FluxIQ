import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../core/index.ts";
import { createBlankAutomationStudioFlowArtifact, type AutomationStudioFlowArtifact, type AutomationStudioFlowEdge, type AutomationStudioFlowNode } from "../../index.ts";
import { validateAutomationStudioFlow, type AutomationStudioFlowValidationContext } from "../flow.ts";

const edge = (id: string, sourceNodeId: string, targetNodeId: string, sourcePortId = "success", targetPortId = "in"): AutomationStudioFlowEdge => ({ id, sourceNodeId, targetNodeId, sourcePortId, targetPortId });

/** Start -> press -> read -> end, with a press whose `total` output the read consumes, and one handler on press. */
function graph(handler: JsonObject, end: JsonObject, extra: { nodes?: AutomationStudioFlowNode[]; edges?: AutomationStudioFlowEdge[] } = {}): AutomationStudioFlowArtifact {
  const flow = createBlankAutomationStudioFlowArtifact({ flowId: "flow.g", projectId: "project", name: "G", now: 1 });
  return {
    ...flow,
    interface: { inputs: [], outputs: [{ id: "result", name: "result", valueType: { kind: "string" }, required: true }] },
    nodes: [
      { id: "start", definitionId: "builtin.control.start" },
      { id: "press", definitionId: "web.press" },
      { id: "read", definitionId: "web.read", metadata: { "fluxiq.checkpoint": { id: "before-read" } } },
      { id: "end", definitionId: "builtin.control.end" },
      { id: "h", definitionId: "builtin.control.handler", parameterValues: handler },
      { id: "h-step", definitionId: "web.press" },
      { id: "h-end", definitionId: "builtin.control.handler-end", parameterValues: end },
      ...(extra.nodes ?? [])
    ],
    edges: [
      edge("e1", "start", "press", "next"),
      edge("e2", "press", "read"),
      edge("e3", "press", "read", "total", "total"),
      edge("e4", "read", "end"),
      edge("e5", "h", "h-step", "body"),
      edge("e6", "h-step", "h-end"),
      ...(extra.edges ?? [])
    ]
  };
}

const onFail = (scope: JsonObject = { kind: "nodes", nodeIds: ["press"] }): JsonObject => ({ event: "fail", scope });

function codes(flow: AutomationStudioFlowArtifact, context?: AutomationStudioFlowValidationContext): string[] {
  return validateAutomationStudioFlow(flow, context).issues.map((issue) => issue.code);
}

describe("Flow validation of lifecycle handlers", () => {
  it("accepts a well-formed handler and does not report its body unreachable", () => {
    const result = validateAutomationStudioFlow(graph(onFail(), { disposition: "route", checkpointId: "before-read" }));
    expect(result).toEqual({ ok: true, issues: [] });
  });

  it("still reports any other node no route enters", () => {
    const flow = graph(onFail(), { disposition: "unhandled" }, { nodes: [{ id: "orphan", definitionId: "web.press" }] });
    const result = validateAutomationStudioFlow(flow);
    expect(result.ok).toBe(true);
    expect(result.issues).toEqual([expect.objectContaining({ severity: "warning", code: "flow.node_unreachable", path: "nodes.7" })]);
  });

  it("does not report nodes the runtime enters without a route: alternative entries and interference clearers", () => {
    const flow = graph(onFail(), { disposition: "unhandled" }, {
      nodes: [
        { id: "entry", definitionId: "web.read", metadata: { "fluxiq.entry": { id: "on-results", order: 1 } } },
        { id: "dismiss", definitionId: "web.press", metadata: { clearsInterference: true } }
      ]
    });
    expect(codes(flow)).toEqual([]);
  });

  it("refuses an unknown event", () => {
    expect(codes(graph({ event: "whenever", scope: { kind: "subflow" } }, { disposition: "unhandled" }))).toContain("flow.handler_unknown_event");
  });

  it("refuses a malformed scope and a scope naming a node outside the graph", () => {
    expect(codes(graph(onFail({ kind: "everywhere" }), { disposition: "unhandled" }))).toContain("flow.handler_invalid_scope");
    expect(codes(graph(onFail({ kind: "nodes", nodeIds: ["press", "elsewhere"] }), { disposition: "unhandled" }))).toContain("flow.handler_scope_node_outside_graph");
  });

  it("refuses a node scope naming Core plumbing, where the event never fires, but not a step that acts or a frame's start", () => {
    const merge: AutomationStudioFlowNode = { id: "merge", definitionId: "builtin.control.merge" };
    const pause: AutomationStudioFlowNode = { id: "pause", definitionId: "builtin.timing.wait" };
    const withPlumbing = (scope: JsonObject, event = "fail") => graph({ event, scope }, { disposition: "unhandled" }, { nodes: [merge, pause] });
    for (const nodeId of ["merge", "pause", "end"]) {
      expect(codes(withPlumbing({ kind: "nodes", nodeIds: [nodeId] }))).toContain("flow.handler_scope_plumbing_node");
    }
    expect(codes(withPlumbing({ kind: "nodes", nodeIds: ["press", "read"] }))).not.toContain("flow.handler_scope_plumbing_node");
    // `start` is a frame's boundary: it fires at the frame's first node, a Start included.
    expect(codes(withPlumbing({ kind: "nodes", nodeIds: ["start"] }, "start"))).not.toContain("flow.handler_scope_plumbing_node");
    expect(codes(withPlumbing({ kind: "nodes", nodeIds: ["start"] }, "before_next"))).toContain("flow.handler_scope_plumbing_node");
  });

  it("refuses automation scope outside the recovery Subflow graph", () => {
    const flow = graph(onFail({ kind: "automation" }), { disposition: "unhandled" });
    expect(codes(flow)).toContain("flow.handler_automation_scope_outside_recovery");
    expect(codes(flow, { subflowRole: "primary" })).toContain("flow.handler_automation_scope_outside_recovery");
    expect(codes(flow, { subflowRole: "recovery" })).not.toContain("flow.handler_automation_scope_outside_recovery");
  });

  it("refuses a body without a Handler End", () => {
    const flow = graph(onFail(), { disposition: "unhandled" });
    flow.edges = flow.edges.filter((entry) => entry.id !== "e6");
    expect(codes(flow)).toContain("flow.handler_body_without_end");
    flow.edges = flow.edges.filter((entry) => entry.id !== "e5");
    expect(codes(flow)).toContain("flow.handler_body_without_end");
  });

  it("refuses a handler inside a body", () => {
    const flow = graph(onFail(), { disposition: "unhandled" }, {
      nodes: [{ id: "nested", definitionId: "builtin.control.handler", parameterValues: onFail() }],
      edges: [edge("e7", "h-step", "nested"), edge("e8", "nested", "h-end", "body")]
    });
    expect(codes(flow)).toContain("flow.handler_inside_body");
  });

  it("refuses a Route to an unknown checkpoint, and accepts one another graph declares", () => {
    const flow = graph(onFail(), { disposition: "route", checkpointId: "nowhere" });
    expect(codes(flow)).toContain("flow.handler_unknown_checkpoint");
    expect(codes(flow, { externalCheckpointIds: ["nowhere"] })).not.toContain("flow.handler_unknown_checkpoint");
  });

  it("refuses a resolve that does not cover the required outputs, at node and subflow scope", () => {
    expect(codes(graph(onFail(), { disposition: "resolve", outputs: {} }))).toContain("flow.handler_resolve_missing_outputs");
    expect(codes(graph(onFail(), { disposition: "resolve", outputs: { total: 3 } }))).not.toContain("flow.handler_resolve_missing_outputs");
    expect(codes(graph(onFail({ kind: "subflow" }), { disposition: "resolve", outputs: { total: 3 } }))).toContain("flow.handler_resolve_missing_outputs");
    expect(codes(graph(onFail({ kind: "subflow" }), { disposition: "resolve", outputs: { result: "ok" } }))).not.toContain("flow.handler_resolve_missing_outputs");
  });

  it("refuses a before or retry handler without a completion check", () => {
    for (const event of ["before", "retry"]) {
      expect(codes(graph({ event, scope: { kind: "subflow" } }, { disposition: "resume" }))).toContain("flow.handler_missing_completion_check");
      expect(codes(graph({ event, scope: { kind: "subflow" }, completionCheck: [{ fact: "host.dialog", op: "absent" }] }, { disposition: "resume" }))).toEqual([]);
    }
  });

  it("refuses resume at fail and resolve before a failure, and an unknown disposition", () => {
    expect(codes(graph(onFail(), { disposition: "resume" }))).toContain("flow.handler_disposition_not_allowed");
    expect(codes(graph({ event: "before_next", scope: { kind: "subflow" } }, { disposition: "resolve", outputs: { result: "x" } }))).toContain("flow.handler_disposition_not_allowed");
    expect(codes(graph(onFail(), { disposition: "explode" }))).toContain("flow.handler_end_unknown_disposition");
  });
});
