import { describe, expect, it } from "vitest";
import { automationNodeStateBinding } from "../../../../nodes/index.ts";
import { runAutomationStudioDetachedCandidate } from "../index.ts";
import { candidateSubflowFixture } from "./subflow-fixture.ts";

describe("a helper's own authored failed alternative", () => {
  it.each(["success", "alternative_failed", "root_failed"] as const)("keeps per-invocation route budgets with outcome %s", async (outcome) => {
    const { input, plan, seen, recompile } = candidateSubflowFixture();
    const leaf = plan.subflows[2]!;
    leaf.nodes.push({ key: "alternative", definitionId: "test.echo", definitionVersion: "1.0.0", parameters: { value: 33 } });
    leaf.edges.push({ key: "alternative", source: { nodeKey: "value", portId: "failed" }, target: { nodeKey: "alternative", portId: "in" } });
    leaf.interface!.outputs[0]!.metadata = { binding: automationNodeStateBinding("$node.alternative.value") };
    recompile();
    const native = input.options!.nativeNodeExecutor!;
    input.options!.nativeNodeExecutor = async (request) => (request.node.id.endsWith(".leaf.value")
      || (outcome === "alternative_failed" && request.node.id.endsWith(".leaf.alternative"))
      || (outcome === "root_failed" && request.node.id.endsWith(".main.consume")))
      ? { result: { status: "failed", route: "failed", outputs: {}, failure: { category: "action_failed", code: "test.primary_failed", retryable: false, stage: "execution" } } }
      : native(request);
    const result = await runAutomationStudioDetachedCandidate(input);
    expect(result.receipt.status).toBe(outcome === "success" ? "succeeded" : "failed");
    expect(seen).toEqual(outcome === "success" ? [33, 33, { first: 33, second: 33 }] : outcome === "root_failed" ? [33, 33] : []);
    if (outcome === "root_failed") {
      expect(result.trace?.attempts.filter((attempt) => attempt.subflowTarget).every((attempt) => attempt.childTrace?.status === "succeeded")).toBe(true);
      expect(result.trace?.attempts.at(-1)?.status).toBe("failed");
    }
  });
});
