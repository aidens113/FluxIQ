import { describe, expect, it } from "vitest";
import type { AutomationStudioLifecycleEvent } from "../../../../nodes/control-flow/index.ts";
import type { AutomationStudioFramePhase, AutomationStudioInvocationFrame } from "../../frames/index.ts";
import type { AutomationStudioHandlerRegistration, AutomationStudioHandlerScope } from "../registration.ts";
import { resolveAutomationStudioHandlerCandidates } from "../scope-resolver.ts";

function frame(invocationId: string, graphFlowId: string, nodeId: string, phase: AutomationStudioFramePhase = "failed", parent?: string, callNodeId?: string): AutomationStudioInvocationFrame {
  return {
    invocationId,
    ...(parent ? { parentInvocationId: parent } : {}),
    ...(callNodeId ? { callNodeId } : {}),
    subflowId: graphFlowId === "root" ? null : `subflow-${graphFlowId}`,
    graphFlowId,
    graphRevision: 1,
    entry: { kind: "default" },
    inputs: {},
    outputs: {},
    cursor: { nodeId, phase }
  };
}

function registration(handlerId: string, graphFlowId: string, scope: AutomationStudioHandlerScope, extra: Partial<AutomationStudioHandlerRegistration> = {}): AutomationStudioHandlerRegistration {
  return {
    handlerId,
    graphFlowId,
    subflowId: null,
    event: "fail",
    scope,
    when: [],
    order: 0,
    completionCheck: [],
    maxRuns: 1,
    documentIndex: 0,
    source: { kind: "handler_node", nodeId: handlerId },
    budgetFree: false,
    ...extra
  };
}

function resolve(stack: AutomationStudioInvocationFrame[], registrations: AutomationStudioHandlerRegistration[], nodeId: string, event: AutomationStudioLifecycleEvent = "fail"): string[] {
  return resolveAutomationStudioHandlerCandidates({ stack, registrations, event, nodeId }).map((candidate) => `${candidate.level}:${candidate.registration.handlerId}`);
}

describe("lifecycle scope resolution", () => {
  // root (Router's subflow "parent") calls "child" at node call-1; the child is failing at node c-press.
  const stack = [frame("inv-1", "parent", "call-1", "before_attempt"), frame("inv-2", "child", "c-press", "failed", "inv-1", "call-1")];

  it("orders candidates node, current subflow, ancestor subflow, automation, whatever their order values", () => {
    const registrations = [
      registration("auto", "recovery", { kind: "automation" }, { order: -5 }),
      registration("ancestor", "parent", { kind: "subflow", inherit: true }, { order: -3 }),
      registration("own-subflow", "child", { kind: "subflow", inherit: true }, { order: 9 }),
      registration("node", "child", { kind: "nodes", nodeIds: ["c-press"] }, { order: 50 })
    ];
    expect(resolve(stack, registrations, "c-press")).toEqual(["node:node", "subflow:own-subflow", "ancestor:ancestor", "automation:auto"]);
  });

  it("orders within a level by ascending order, then document order", () => {
    const registrations = [
      registration("late-doc", "child", { kind: "subflow", inherit: true }, { order: 1, documentIndex: 7 }),
      registration("early-doc", "child", { kind: "subflow", inherit: true }, { order: 1, documentIndex: 2 }),
      registration("low-order", "child", { kind: "subflow", inherit: true }, { order: 0, documentIndex: 9 })
    ];
    expect(resolve(stack, registrations, "c-press")).toEqual(["subflow:low-order", "subflow:early-doc", "subflow:late-doc"]);
  });

  it("does not extend a Call Subflow node's scope into its child", () => {
    const registrations = [registration("on-call-node", "parent", { kind: "nodes", nodeIds: ["call-1"] })];
    expect(resolve(stack, registrations, "c-press")).toEqual([]);
    // Once the child's failure becomes the call node's failure in the parent, it applies.
    expect(resolve(stack.slice(0, 1), registrations, "call-1")).toEqual(["node:on-call-node"]);
  });

  it("matches node scope exactly", () => {
    const registrations = [registration("other-node", "child", { kind: "nodes", nodeIds: ["c-other"] })];
    expect(resolve(stack, registrations, "c-press")).toEqual([]);
  });

  it("lets an ancestor's subflow handler reach a descendant only when it inherits", () => {
    const registrations = [
      registration("inherits", "parent", { kind: "subflow", inherit: true }),
      registration("stays-home", "parent", { kind: "subflow", inherit: false })
    ];
    expect(resolve(stack, registrations, "c-press")).toEqual(["ancestor:inherits"]);
    // In its own frame, inherit: false still applies.
    expect(resolve(stack.slice(0, 1), registrations, "call-1")).toEqual(["subflow:inherits", "subflow:stays-home"]);
  });

  it("excludes registrations from graphs no active frame is running", () => {
    const registrations = [
      registration("sibling-subflow", "sibling", { kind: "subflow", inherit: true }),
      registration("sibling-node", "sibling", { kind: "nodes", nodeIds: ["c-press"] })
    ];
    expect(resolve(stack, registrations, "c-press")).toEqual([]);
  });

  it("puts nearer ancestors first at equal order", () => {
    const deep = [frame("inv-0", "grand", "call-0", "before_attempt"), ...stack.map((entry) => ({ ...entry }))];
    const registrations = [
      registration("grand", "grand", { kind: "subflow", inherit: true }, { documentIndex: 0 }),
      registration("parent", "parent", { kind: "subflow", inherit: true }, { documentIndex: 5 })
    ];
    expect(resolve(deep, registrations, "c-press")).toEqual(["ancestor:parent", "ancestor:grand"]);
  });

  it("filters by event", () => {
    const registrations = [registration("before", "child", { kind: "subflow", inherit: true }, { event: "before" })];
    expect(resolve(stack, registrations, "c-press", "fail")).toEqual([]);
    expect(resolve(stack, registrations, "c-press", "before")).toEqual(["subflow:before"]);
  });

  it("dispatches nothing while any frame is running a handler body", () => {
    const inBody = [frame("inv-1", "parent", "h-1", "handler"), frame("inv-3", "child", "c-press", "failed", "inv-1", "h-1")];
    expect(resolve(inBody, [registration("any", "child", { kind: "subflow", inherit: true })], "c-press")).toEqual([]);
    expect(resolve([], [registration("any", "child", { kind: "subflow", inherit: true })], "c-press")).toEqual([]);
  });

  it("never offers an interference node as its own recovery", () => {
    const registrations = [
      registration("child/c-press#clears_interference", "child", { kind: "automation" }, { event: "retry", source: { kind: "clears_interference", nodeId: "c-press" } }),
      registration("child/c-dismiss#clears_interference", "child", { kind: "automation" }, { event: "retry", source: { kind: "clears_interference", nodeId: "c-dismiss" } })
    ];
    expect(resolve(stack, registrations, "c-press", "retry")).toEqual(["automation:child/c-dismiss#clears_interference"]);
  });
});
