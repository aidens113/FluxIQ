import { describe, expect, it } from "vitest";
import type { JsonValue } from "../../../../../../core/index.ts";
import { runAutomationStudioGraph } from "../../graph-run.ts";
import { setup, found } from "./fixtures.ts";
import type { AutomationStudioUnboundTargetReacquireAnswer } from "../answer.ts";
import { automationStudioRootInvocation } from "../../frames/index.ts";
import { automationStudioCompletedActIdentity } from "../../lifecycle-run/index.ts";

describe("source-less identity recovery through real execution", () => {
  it.each(["native", "output"] as const)("refreshes only target fields through %s dispatch and resolved captures", async (kind) => {
    const test = setup(kind);
    const original = structuredClone(test.flow);
    const trace = await runAutomationStudioGraph(test.flow, test.options);
    expect(trace.status).toBe("succeeded");
    expect(test.seen.map((parameters) => parameters.selector)).toEqual(["old", "old", "old", "fresh"]);
    expect(test.seen.every((parameters) => parameters.note === "unchanged")).toBe(true);
    expect(test.flow).toEqual(original);
    expect(test.requests).toHaveLength(1);
    const request = test.requests[0]!;
    expect(request.refresh).toMatchObject({ container: kind === "native" ? "node" : "output", parameterIds: ["selector", "element"], removableParameterIds: ["selector"] });
    expect(request.previousAttempt).toEqual({ attemptId: "act.attempt.3", beforeAction: { stateSnapshotId: expect.any(String), stateRef: expect.any(String), capturedAt: 1 } });
    expect(request.previousAttempt.beforeAction!.stateRef).toBe(test.captures.find((capture) => capture.attemptId === "act.attempt.3" && capture.point === "before_action")!.ref);
    expect(request).not.toHaveProperty("source");
    expect(Object.isFrozen(request.parameters)).toBe(true);
    const captured = test.captures.find((capture) => capture.point === "before_action" && capture.attemptId === "act.attempt.4")!.node.parameterValues!;
    expect(kind === "native" ? captured.selector : (captured.parameters as Record<string, JsonValue>).selector).toBe("fresh");
    expect(trace.attempts.at(-1)?.reacquire).toEqual({ kind: "identity", outcome: "found", at: expect.any(Number) });
    expect(JSON.stringify(trace.attempts.at(-1)?.reacquire)).not.toContain("specimen-17");
  });

  it("passes Flow inputs and a variable written earlier in the run as actual parameters", async () => {
    const test = setup();
    test.node.parameterValues = { selector: { $state: { path: "currentAddress" } }, element: { $state: { path: "identity" } }, note: { $state: { path: "missing", fallback: "kept fallback" } } };
    test.options.inputs = { identity: { identity: "specimen-17" }, value: "old" };
    test.options.variables = { currentAddress: "seed" };
    test.flow.nodes.unshift({ id: "write", definitionId: "builtin.data.set-variable", parameterValues: { name: "currentAddress" } });
    test.flow.edges.push({ id: "write-act", sourceNodeId: "write", sourcePortId: "success", targetNodeId: "act", targetPortId: "in" });
    const trace = await runAutomationStudioGraph(test.flow, test.options);
    expect(trace.status).toBe("succeeded");
    expect(test.requests[0]?.parameters).toMatchObject({ selector: "old", element: { identity: "specimen-17" }, note: "kept fallback" });
    expect(test.options.inputs.identity).toEqual({ identity: "specimen-17" });
    expect(test.options.variables.currentAddress).toBe("seed");
    expect(test.node.parameterValues.selector).toEqual({ $state: { path: "currentAddress" } });
  });

  it("keeps backward behavior when the optional host method is absent", async () => {
    const test = setup();
    delete test.options.hostRuntime!.reacquireUnboundTarget;
    const trace = await runAutomationStudioGraph(test.flow, test.options);
    expect(test.seen).toHaveLength(4);
    expect(trace.attempts.every((attempt) => !attempt.reacquire)).toBe(true);
  });

  it("keeps an unresolved parameter non-executable rather than patching over it", async () => {
    const test = setup();
    test.node.parameterValues!.element = { $state: { path: "missingIdentity" } };
    const trace = await runAutomationStudioGraph(test.flow, test.options);
    expect(test.seen).toHaveLength(0);
    expect(test.requests).toHaveLength(0);
    expect(trace.attempts[0]?.failure?.code).toBe("executor.parameter.unresolved_state_path");
  });

  it.each([
    [{ outcome: "unmatched", reason: "ambiguous" }, "ambiguous", 4],
    [{ outcome: "unmatched", reason: "unidentifiable" }, "unidentifiable", 4],
    [{ outcome: "unavailable", reason: "observation_incomplete" }, "observation_incomplete", 4],
    [{ outcome: "unavailable", reason: "place_unproved" }, "place_unproved", 4],
    [{ outcome: "gone", coverage: "complete" }, undefined, 3],
    [{ outcome: "gone" }, "malformed_answer", 4],
    [{ outcome: "found", patches: [{ operation: "set", parameterId: "note", value: "different act" }] }, "invalid_patch", 4]
  ] as const)("preserves real outcomes for %j", async (answer, reason, calls) => {
    const test = setup("native", () => answer as unknown as AutomationStudioUnboundTargetReacquireAnswer);
    const trace = await runAutomationStudioGraph(test.flow, test.options);
    expect(test.seen).toHaveLength(calls);
    expect(test.requests).toHaveLength(1);
    expect(trace.attempts.at(-1)?.reacquire).toMatchObject({ kind: "identity", outcome: answer.outcome === "gone" && "coverage" in answer ? "gone" : reason === "malformed_answer" || reason === "invalid_patch" ? "unmatched" : answer.outcome, ...(reason ? { reason } : {}) });
    expect(trace.attempts.at(-1)?.failure?.code).toBe(calls === 3 ? "executor.target.gone" : "example.target.stale");
  });

  it("cancels during the lookup without a fresh action or synthetic gone", async () => {
    const controller = new AbortController();
    const test = setup("native", () => {
      controller.abort();
      return { outcome: "gone", coverage: "complete" };
    });
    test.options.signal = controller.signal;
    const trace = await runAutomationStudioGraph(test.flow, test.options);
    expect(trace.status).toBe("cancelled");
    expect(test.seen).toHaveLength(3);
    expect(trace.attempts).toHaveLength(3);
  });

  it("retains accepted patches for remaining retries and leaves other nodes original", async () => {
    const test = setup("output");
    const dispatch = test.options.effectDispatcher!;
    let freshFailures = 0;
    test.options.retryPolicy = { maxAttempts: 6, backoffMs: [] };
    test.options.effectDispatcher = async (effect, context) => {
      const answer = await dispatch(effect, context);
      const selector = ((effect.payload as { parameters: Record<string, JsonValue> }).parameters).selector;
      return selector === "fresh" && freshFailures++ < 2 ? { status: "failed", outputs: {}, failure: { category: "target_not_found", code: "example.target.stale", retryable: true, stage: "target_resolution", effect: "unacted" } } : answer;
    };
    const other = { ...structuredClone(test.node), id: "other" };
    test.flow.nodes.push(other);
    test.flow.edges.push({ id: "next", sourceNodeId: "act", targetNodeId: "other", sourcePortId: "success", targetPortId: "in" });
    const trace = await runAutomationStudioGraph(test.flow, test.options);
    expect(trace.status).toBe("succeeded");
    expect(test.seen.map((parameters) => parameters.selector)).toEqual(["old", "old", "old", "fresh", "fresh", "fresh", "old", "old", "old", "fresh"]);
    expect(test.requests.map((request) => request.node.id)).toEqual(["act", "other"]);
    expect(other.parameterValues).toEqual(test.node.parameterValues);
  });

  it("pins the prior commit floor when the registry later weakens it", async () => {
    let weakened = false;
    const test = setup("output", () => {
      weakened = true;
      return found;
    });
    test.options.resolveActionEffect = () => ({ effectClass: weakened ? "observe" : "commit", permissionConsequences: weakened ? [] : ["modify_existing"] });
    const dispatch = test.options.effectDispatcher!;
    test.options.retryPolicy = { maxAttempts: 6, backoffMs: [] };
    test.options.effectDispatcher = async (effect, context) => {
      const result = await dispatch(effect, context);
      if (((effect.payload as { parameters: Record<string, JsonValue> }).parameters).selector === "fresh") throw new Error("Network answer lost.");
      return result;
    };
    const trace = await runAutomationStudioGraph(test.flow, test.options);
    expect(test.seen.map((parameters) => parameters.selector)).toEqual(["old", "old", "old", "fresh"]);
    expect(trace.failure?.code).toBe("run.outcome_uncertain");
  });

  it.each(["weakened", "throwing"] as const)("skips the original act completed during an awaited lookup with a %s resolver", async (change) => {
    let completed = false;
    const test = setup("native", async () => {
      await Promise.resolve();
      completed = true;
      invocation.run.lifecycle.completedActs.set(key, { key, nodeId: test.node.id, attemptId: "settled-elsewhere", outputs: { settled: true } });
      return found;
    });
    test.options.resolveActionEffect = () => {
      if (completed && change === "throwing") throw new Error("Registry became unreadable.");
      return { effectClass: completed ? "observe" : "commit", permissionConsequences: [] };
    };
    const invocation = automationStudioRootInvocation(test.flow, test.options);
    test.options.invocation = invocation;
    const key = automationStudioCompletedActIdentity({ flow: test.flow, node: test.node, attempts: [], values: {}, variables: new Map(), runInputs: {}, frameInputs: invocation.frame.inputs });
    const trace = await runAutomationStudioGraph(test.flow, test.options);
    expect(test.seen).toHaveLength(3);
    expect(trace.status).toBe("succeeded");
    expect(trace.attempts.at(-1)?.skipped).toMatchObject({ reason: "already_done", attemptId: "settled-elsewhere" });
    expect(invocation.run.lifecycle.completedActs.get(key)?.attemptId).toBe("settled-elsewhere");
    expect(trace.attempts.at(-1)?.reacquire).toBeUndefined();
  });

  it("keeps a post-match resolver failure as an actual unacted failure without dispatch", async () => {
    let failed = false;
    const test = setup("native", () => {
      failed = true;
      return found;
    });
    test.options.resolveActionEffect = () => {
      if (failed) throw new Error("Private registry details.");
      return { effectClass: "commit", permissionConsequences: [] };
    };
    const trace = await runAutomationStudioGraph(test.flow, test.options);
    expect(test.seen).toHaveLength(3);
    expect(trace.attempts.at(-1)?.failure).toMatchObject({ code: "executor.action_effect.resolve_failed", effect: "unacted" });
    expect(trace.attempts.at(-1)?.reacquire).toMatchObject({ outcome: "unavailable", reason: "action_effect_unavailable" });
    expect(JSON.stringify(trace)).not.toContain("Private registry");
  });

  it("refuses a target that would require stronger action authority", async () => {
    const test = setup();
    test.options.resolveActionEffect = (_node, parameters) => ({ effectClass: parameters?.selector === "fresh" ? "commit" : "observe", permissionConsequences: parameters?.selector === "fresh" ? ["delete"] : [] });
    const trace = await runAutomationStudioGraph(test.flow, test.options);
    expect(test.seen.map((parameters) => parameters.selector)).toEqual(["old", "old", "old", "old"]);
    expect(trace.attempts.at(-1)?.reacquire).toMatchObject({ outcome: "unmatched", reason: "authority_changed" });
  });
});
