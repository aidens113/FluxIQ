import { describe, expect, it } from "vitest";

import { flowInstructionScopeFromPayload } from "./handlers.ts";

const base = { projectId: "project.one", flowId: "flow.one", title: "Rule", body: "Apply it" };

describe("flowInstructionScopeFromPayload", () => {
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