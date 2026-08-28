import { describe, expect, it } from "vitest";

import { AUTOMATION_STUDIO_ENDPOINTS, AUTOMATION_STUDIO_NORMAL_EDITOR_GRAPH_WRITE_ENDPOINT, assertAutomationStudioNormalEditorGraphEndpoint } from "./contracts.ts";
import { flowInstructionScopeFromPayload } from "./handlers.ts";

const base = { projectId: "project.one", flowId: "flow.one", title: "Rule", body: "Apply it" };

describe("flowInstructionScopeFromPayload", () => {
  it("exposes a bounded development performance snapshot endpoint", () => {
    expect(AUTOMATION_STUDIO_ENDPOINTS.performanceMetrics).toBe("get-performance-metrics");
  });
  it("exposes graph patch endpoints as the normal editor write API", () => {
    expect(AUTOMATION_STUDIO_ENDPOINTS.getGraphViewport).toBe("get-graph-viewport");
    expect(AUTOMATION_STUDIO_ENDPOINTS.applyGraphPatch).toBe("apply-graph-patch");
    expect(AUTOMATION_STUDIO_ENDPOINTS.listGraphRevisions).toBe("list-graph-revisions");
    expect(AUTOMATION_STUDIO_ENDPOINTS.createGraphSnapshot).toBe("create-graph-snapshot");
    expect(AUTOMATION_STUDIO_ENDPOINTS.restoreGraphSnapshot).toBe("restore-graph-snapshot");
    expect(AUTOMATION_STUDIO_NORMAL_EDITOR_GRAPH_WRITE_ENDPOINT).toBe(AUTOMATION_STUDIO_ENDPOINTS.applyGraphPatch);
    expect(() => assertAutomationStudioNormalEditorGraphEndpoint(AUTOMATION_STUDIO_ENDPOINTS.saveFlow)).toThrow(/full Flow document/);
    expect(() => assertAutomationStudioNormalEditorGraphEndpoint(AUTOMATION_STUDIO_ENDPOINTS.applyGraphPatch)).not.toThrow();
  });
  it("exposes a cursor-based project change-feed endpoint for browser sync", () => {
    expect(AUTOMATION_STUDIO_ENDPOINTS.listProjectChangeFeed).toBe("list-project-change-feed");
  });
  it("exposes ordered runtime event pages for Runtime Debug", () => {
    expect(AUTOMATION_STUDIO_ENDPOINTS.listFlowRunEvents).toBe("list-flow-run-events");
  });
  it("preserves global and project scopes", () => {
    expect(flowInstructionScopeFromPayload("project.one", "flow.one", { ...base, scopeKind: "global" })).toEqual({ kind: "global" });
    expect(flowInstructionScopeFromPayload("project.one", "flow.one", { ...base, scopeKind: "project" })).toEqual({ kind: "project", projectId: "project.one" });
  });

  it("preserves named Router, Subflow, node, error, and review targets", () => {
    expect(flowInstructionScopeFromPayload("project.one", "flow.one", { ...base, scopeKind: "router", routerId: "router.one" })).toMatchObject({ kind: "router", routerId: "router.one" });
    expect(flowInstructionScopeFromPayload("project.one", "flow.one", { ...base, scopeKind: "subflow", subflowId: "subflow.one" })).toMatchObject({ kind: "subflow", subflowId: "subflow.one" });
    expect(flowInstructionScopeFromPayload("project.one", "flow.one", { ...base, scopeKind: "node", nodeId: "node.one", subflowId: "subflow.one" })).toMatchObject({ kind: "node", nodeId: "node.one", subflowId: "subflow.one" });
    expect(flowInstructionScopeFromPayload("project.one", "flow.one", { ...base, scopeKind: "on_error", nodeId: "node.one" })).toMatchObject({ kind: "on_error", nodeId: "node.one" });
    expect(flowInstructionScopeFromPayload("project.one", "flow.one", { ...base, scopeKind: "adaptation_review", subflowId: "subflow.one" })).toMatchObject({ kind: "adaptation_review", subflowId: "subflow.one" });
  });
});
