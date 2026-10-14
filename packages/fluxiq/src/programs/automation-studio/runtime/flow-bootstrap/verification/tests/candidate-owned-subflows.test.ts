import { describe, expect, it } from "vitest";
import { runAutomationStudioDetachedCandidate } from "../index.ts";
import { candidateSubflowFixture } from "./subflow-fixture.ts";
import { automationStudioRootInvocation } from "../../../executor/frames/index.ts";
import { automationNodeStateBinding } from "../../../../nodes/index.ts";

describe("detached candidate-owned sibling graphs", () => {
  it("runs two nested helpers with distinct call inputs and declared results without an injected loader", async () => {
    const { input, seen } = candidateSubflowFixture();
    const accepted = structuredClone(input.parentFlow);
    const result = await runAutomationStudioDetachedCandidate(input);
    expect(result.receipt.status).toBe("succeeded");
    expect(seen).toEqual([11, 22, { first: 11, second: 22 }]);
    // Saved traces retain normal withholding; the native consumer above proves actual result binding.
    expect(result.trace?.values.firstResult).toBe("[withheld]");
    const calls = result.trace?.attempts.filter((attempt) => attempt.definitionId === "builtin.control.call-subflow") ?? [];
    expect(calls).toHaveLength(2);
    for (const call of calls) {
      expect(call.childTrace?.status).toBe("succeeded");
      expect(call.childTrace?.attempts.at(-1)?.childTrace?.status).toBe("succeeded");
    }
    expect(input.parentFlow).toEqual(accepted);
    expect(input.options?.subflowGraphs).toBeUndefined();
  });

  it("isolates caller foreign graph sources and never reads accepted sibling graphs", async () => {
    const { input, seen } = candidateSubflowFixture();
    let foreignReads = 0;
    input.options!.subflowGraphs = {
      load: async () => {
        foreignReads += 1;
        throw new Error("Foreign graph source used.");
      },
      recovery: async () => {
        foreignReads += 1;
        return undefined;
      }
    };
    const result = await runAutomationStudioDetachedCandidate(input);
    expect(result.receipt.status).toBe("succeeded");
    expect(foreignReads).toBe(0);
    expect(seen).toEqual([11, 22, { first: 11, second: 22 }]);
  });

  it("refuses a missing helper target before any candidate dispatch", async () => {
    const { input, seen } = candidateSubflowFixture();
    input.candidate.buildPlan.plan.subflows[2]!.nodes[1] = { key: "value", definitionId: "builtin.control.call-subflow", definitionVersion: "1.0.0", parameters: { subflowId: "absent", inputs: {}, outputs: {} } };
    const result = await runAutomationStudioDetachedCandidate(input);
    expect(result.code).toBe("candidate.execution_plan_invalid");
    expect(result.receipt.status).toBe("not_run");
    expect(result.receipt.executedNodeCount).toBe(0);
    expect(result.trace).toBeUndefined();
    expect(seen).toEqual([]);
  });

  it("declines a cyclic helper call through normal frame safety", async () => {
    const { input, plan, recompile, seen } = candidateSubflowFixture();
    plan.subflows[2]!.nodes[1] = { key: "value", definitionId: "builtin.control.call-subflow", definitionVersion: "1.0.0", parameters: { subflowId: "main", inputs: {}, outputs: {} } };
    recompile();
    const result = await runAutomationStudioDetachedCandidate(input);
    expect(result.receipt.status).toBe("failed");
    expect(seen).toEqual([]);
    expect(result.trace?.attempts.at(-1)?.childTrace?.status).toBe("failed");
  });

  it.each(["stale", "cancel"])("fails closed when the candidate becomes %s during a child call", async (kind) => {
    const { input, seen } = candidateSubflowFixture();
    const controller = new AbortController();
    input.signal = controller.signal;
    const native = input.options!.nativeNodeExecutor!;
    input.options!.nativeNodeExecutor = async (request) => {
      const result = await native(request);
      if (kind === "cancel") controller.abort();
      else input.currentIdentity = async () => ({ ...input.identity, digest: "changed" });
      return result;
    };
    const result = await runAutomationStudioDetachedCandidate(input);
    expect(result.receipt.status).toBe(kind === "cancel" ? "cancelled" : "failed");
    expect(seen).toEqual([11]);
  });

  it("propagates a required child failure rather than continuing to the next helper", async () => {
    const { input } = candidateSubflowFixture();
    input.options!.nativeNodeExecutor = async () => ({ result: { status: "failed", route: "failed", outputs: {}, failure: { category: "action_failed", code: "test.failed", retryable: false, stage: "execution" } } });
    const result = await runAutomationStudioDetachedCandidate(input);
    expect(result.receipt.status).toBe("failed");
    expect(result.trace?.attempts.filter((attempt) => attempt.definitionId === "builtin.control.call-subflow")).toHaveLength(1);
    expect(result.trace?.attempts.at(-1)?.childTrace?.status).toBe("failed");
  });

  it("refuses a foreign invocation holder which could override the candidate's child graph", async () => {
    const { input, seen } = candidateSubflowFixture();
    input.options!.invocation = automationStudioRootInvocation(input.parentFlow, input.options!, async () => ({ status: "failed", startedAt: 1, values: {}, effects: [], attempts: [] }));
    expect(await runAutomationStudioDetachedCandidate(input)).toMatchObject({ code: "candidate.foreign_invocation_unsupported", receipt: { status: "not_run" } });
    expect(seen).toEqual([]);
  });

  it("calls the same nested helper for each row with that row's input and consumes its returned result", async () => {
    const { input, plan, recompile, seen } = candidateSubflowFixture();
    const main = plan.subflows[0]!;
    main.nodes = [
      main.nodes[0]!,
      { key: "list", definitionId: "builtin.data.constant", definitionVersion: "1.0.0", parameters: { value: [11, 22] } },
      { key: "head", definitionId: "builtin.control.merge", definitionVersion: "1.0.0" },
      { key: "each", definitionId: "builtin.control.for-each", definitionVersion: "1.0.0" },
      { key: "call", definitionId: "builtin.control.call-subflow", definitionVersion: "1.0.0", parameters: { subflowId: "middle", inputs: { item: automationNodeStateBinding("$node.each.item") }, outputs: { value: "result" } } },
      { key: "consume", definitionId: "test.echo", definitionVersion: "1.0.0", parameters: { value: automationNodeStateBinding("result") } },
      { key: "end", definitionId: "builtin.control.end", definitionVersion: "1.0.0" }
    ];
    const edge = (source: string, sourcePort: string, target: string, targetPort = "in") => ({ key: `${source}${sourcePort}${target}`, source: { nodeKey: source, portId: sourcePort }, target: { nodeKey: target, portId: targetPort } });
    main.edges = [edge("start", "success", "list"), edge("list", "success", "head", "branches"), edge("list", "value", "each", "items"), edge("head", "success", "each"), edge("each", "body", "call"), edge("call", "success", "consume"), edge("consume", "success", "head", "branches"), edge("each", "done", "end")];
    recompile();
    const result = await runAutomationStudioDetachedCandidate(input);
    expect(result.receipt.status).toBe("succeeded");
    expect(seen).toEqual([11, 11, 22, 22]);
    expect(result.trace?.attempts.filter((attempt) => attempt.subflowTarget)).toHaveLength(2);
    expect(result.receipt.executedNodeCount).toBeGreaterThan(result.trace?.attempts.length ?? 0);
  });
});
