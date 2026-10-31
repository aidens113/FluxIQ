import { describe, expect, it, vi } from "vitest";
import { automationStudioStepReacquire } from "../../target-reacquire/index.ts";
import type { AutomationStudioNodeAttemptTrace } from "../../contracts.ts";
import type { AutomationStudioUnboundTargetReacquireAnswer } from "../answer.ts";
import { automationStudioRootInvocation } from "../../frames/index.ts";
import { context, found, stale } from "./fixtures.ts";

const policy = (maxAttempts = 4) => ({ maxAttempts, backoffMs: [] });

describe("source-less trigger and closed host boundary", () => {
  it.each([1, 2, 3, 4, 6])("uses the shared timing exactly once with %s attempts", async (maximum) => {
    const lookup = vi.fn(() => found);
    const { ctx, node } = context({ hostRuntime: { capabilities: [], reacquireUnboundTarget: lookup } });
    const expected = maximum >= 4 ? 4 : maximum >= 2 ? maximum : undefined;
    for (let at = 1; at <= maximum; at++) {
      ctx.arrival.attempts = at;
      const result = await automationStudioStepReacquire(ctx, node, policy(maximum));
      expect(Boolean(result)).toBe(at === expected);
    }
    expect(lookup).toHaveBeenCalledTimes(expected ? 1 : 0);
  });

  it.each<Partial<AutomationStudioNodeAttemptTrace>>([
    { failure: { ...stale, effect: "ambiguous" } },
    { effectCheck: { result: "landed", checkedAt: 1 } },
    { effectCheck: { result: "unknown", checkedAt: 1 } },
    { stateHeld: { rung: "skip_satisfied_node", route: "success" } },
    { skipped: { reason: "already_done", code: "executor.act.already_done", attemptId: "prior" } },
    { fault: { actUncertain: true } as NonNullable<AutomationStudioNodeAttemptTrace["fault"]> },
    { failure: { ...stale, code: "executor.target.gone" } }
  ])("never observes an uncertain, settled or gone attempt %j", async (extra) => {
    const lookup = vi.fn(() => found);
    const { ctx, node, previous } = context({ hostRuntime: { capabilities: [], reacquireUnboundTarget: lookup } });
    Object.assign(previous, extra);
    expect(await automationStudioStepReacquire(ctx, node, policy())).toBeUndefined();
    expect(lookup).not.toHaveBeenCalled();
  });

  it("does not install a target when the act completes during observation", async () => {
    const { ctx, node } = context();
    const invocation = automationStudioRootInvocation(ctx.flow, ctx.options);
    const completed = invocation.run.lifecycle.completedActs;
    ctx.lifecycle.pendingAct = { nodeId: node.id, key: "act-key" };
    ctx.options.invocation = invocation;
    ctx.options.hostRuntime!.reacquireUnboundTarget = () => {
      completed.set("act-key", { key: "act-key", nodeId: node.id, attemptId: "settled-elsewhere", outputs: {} });
      return found;
    };
    expect(await automationStudioStepReacquire(ctx, node, policy())).toBeUndefined();
    expect(ctx.arrival.parameterOverlay).toBeUndefined();
    expect(ctx.arrival.identityReacquired).toBe(true);
    expect(ctx.lifecycle.pendingAct).toEqual({ nodeId: node.id, key: "act-key" });
  });

  it.each([
    [() => { throw new Error("private target text"); }, "host_failed"],
    [() => ({ outcome: "gone" }), "malformed_answer"],
    [() => Object.defineProperty({}, "outcome", { enumerable: true, get: () => { throw new Error("must not execute getter"); } }), "malformed_answer"],
    [() => new Proxy({}, { ownKeys: () => { throw new Error("private proxy text"); } }), "malformed_answer"],
    [() => ({ outcome: "found", patches: [{ operation: "set", parameterId: "selector", value: "fresh" }, { operation: "remove", parameterId: "selector" }] }), "invalid_patch"]
  ] as const)("reads throwing and malformed hosts as closed failures", async (answer, reason) => {
    const { ctx, node } = context({ hostRuntime: { capabilities: [], reacquireUnboundTarget: answer as () => AutomationStudioUnboundTargetReacquireAnswer } });
    const result = await automationStudioStepReacquire(ctx, node, policy());
    expect(result?.record).toMatchObject({ kind: "identity", outcome: "unmatched", reason });
    expect(JSON.stringify(result)).not.toContain("private");
    expect(ctx.arrival.parameterOverlay).toBeUndefined();
  });

  it("declines missing declarations and unresolved bindings before observation", async () => {
    for (const missing of ["declaration", "binding"] as const) {
      const lookup = vi.fn(() => found);
      const { ctx, node } = context({ hostRuntime: { capabilities: [], reacquireUnboundTarget: lookup } });
      if (missing === "declaration") delete ctx.options.resolveTargetRefresh;
      else node.parameterValues!.element = { $state: { path: "notSupplied" } };
      const result = await automationStudioStepReacquire(ctx, node, policy());
      expect(result?.record).toMatchObject({ outcome: "unavailable", reason: missing === "declaration" ? "no_refresh_declaration" : "unresolved_parameters" });
      expect(lookup).not.toHaveBeenCalled();
    }
  });

  it("prevents request mutation from changing the saved node or write authority", async () => {
    const { ctx, node } = context();
    const original = structuredClone(node);
    ctx.options.hostRuntime!.reacquireUnboundTarget = (request) => {
      expect(request.node).not.toBe(node);
      expect(request.refresh).not.toBe(ctx.arrival.parameterOverlay?.refresh);
      expect(() => { (request.refresh.parameterIds as string[]).push("approval"); }).toThrow();
      return found;
    };
    expect((await automationStudioStepReacquire(ctx, node, policy()))?.record.outcome).toBe("found");
    expect(node).toEqual(original);
  });

  it("never takes a source-less escape after an existing source branch cannot rerun", async () => {
    const lookup = vi.fn(() => found);
    const { ctx, node } = context({ hostRuntime: { capabilities: [], reacquireUnboundTarget: lookup } });
    const source = { id: "find", definitionId: "example.find", metadata: { effect: "mutate" } };
    ctx.flow.nodes.unshift(source);
    ctx.nodesById = new Map(ctx.flow.nodes.map((item) => [item.id, item]));
    node.parameterValues!.element = { $state: { path: "find.element" } };
    ctx.values["find.element"] = { identity: "specimen-17" };
    const result = await automationStudioStepReacquire(ctx, node, policy());
    expect(result?.record).toMatchObject({ kind: "output", sourceNodeId: "find", outcome: "unavailable", reason: "source_not_read_only" });
    expect(lookup).not.toHaveBeenCalled();
  });

  it("rejects a binding changed while observation was awaiting", async () => {
    const { ctx, node } = context();
    node.parameterValues!.selector = { $state: { path: "address" } };
    ctx.values.address = "old";
    ctx.options.hostRuntime!.reacquireUnboundTarget = async () => {
      await Promise.resolve();
      ctx.values.address = "deliberately changed";
      return found;
    };
    const result = await automationStudioStepReacquire(ctx, node, policy());
    expect(result?.record).toMatchObject({ outcome: "unmatched", reason: "binding_changed" });
    expect(ctx.arrival.parameterOverlay).toBeUndefined();
  });
});
