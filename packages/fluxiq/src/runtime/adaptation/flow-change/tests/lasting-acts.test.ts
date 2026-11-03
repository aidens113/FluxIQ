// What counts as a lasting act that a re-run from the Flow's start would repeat.
import { describe, expect, it } from "vitest";
import type { AutomationStudioNodeAttemptTrace } from "../../../../framework/automation-service/executor/index.ts";
import type { AutomationStudioFlowNode } from "../../../../flows/authoring/model/index.ts";
import { automationStudioAttemptsMayHaveActedLastingly } from "../lasting-acts.ts";

const node = (id: string, extra: Partial<AutomationStudioFlowNode> = {}): AutomationStudioFlowNode => ({ id, definitionId: "web.output.dom-click", ...extra });
const attempt = (nodeId: string, extra: Partial<AutomationStudioNodeAttemptTrace> = {}): AutomationStudioNodeAttemptTrace =>
  ({ attemptId: `${nodeId}.attempt.1`, nodeId, definitionId: "web.output.dom-click", startedAt: 1, status: "succeeded", inputs: {}, outputs: {}, effects: [], ...extra });
const asked = (nodes: AutomationStudioFlowNode[], attempts: AutomationStudioNodeAttemptTrace[], extra: Partial<Parameters<typeof automationStudioAttemptsMayHaveActedLastingly>[0]> = {}) =>
  automationStudioAttemptsMayHaveActedLastingly({ flow: { nodes }, attempts, ...extra });

describe("whether a pass may have acted lastingly", () => {
  it("does not count a step that states nothing lasting, a press included: a verb's floor is not a statement", async () => {
    const press = node("press", { metadata: { declaredConsequences: [] } });
    await expect(asked([press], [attempt("press")], { resolveActionEffect: () => ({ effectClass: "commit", permissionConsequences: [] }) })).resolves.toBe(false);
  });

  it("counts a declared consequence, an explicit mark, and a consequence the domain's effect names", async () => {
    await expect(asked([node("order", { metadata: { declaredConsequences: ["create_new"] } })], [attempt("order")])).resolves.toBe(true);
    await expect(asked([node("wipe", { metadata: { destructive: true } })], [attempt("wipe")])).resolves.toBe(true);
    await expect(asked([node("pay")], [attempt("pay")], { resolveActionEffect: () => ({ effectClass: "commit", permissionConsequences: ["move_money"] }) })).resolves.toBe(true);
  });

  it("counts an outcome the run read as uncertain, whatever the step said", async () => {
    await expect(asked([node("press")], [attempt("press", { status: "failed", fault: { actUncertain: true } as NonNullable<AutomationStudioNodeAttemptTrace["fault"]> })])).resolves.toBe(true);
    await expect(asked([node("press")], [attempt("press", { effectCheck: { result: "unknown", checkedAt: 1 } })])).resolves.toBe(true);
  });

  it("does not count a step that was skipped: it did nothing on this attempt", async () => {
    const order = node("order", { metadata: { declaredConsequences: ["create_new"] } });
    await expect(asked([order], [attempt("order", { skipped: { reason: "target_absent", code: "web.target.not_found" } })])).resolves.toBe(false);
  });

  it("reads a called part's steps from its graph, and counts what it cannot read: not knowing is not a no", async () => {
    const call = node("call", { definitionId: "builtin.control.call-subflow" });
    const called = attempt("call", { definitionId: "builtin.control.call-subflow", subflowTarget: { subflowId: "part", graphFlowId: "graph.part", graphRevision: 1 }, childTrace: { status: "succeeded", startedAt: 1, attempts: [attempt("inner")], effects: [], values: {} } as unknown as NonNullable<AutomationStudioNodeAttemptTrace["childTrace"]> });
    const graph = (inner: AutomationStudioFlowNode) => ({ load: async () => ({ subflowId: "part", graphRevision: 1, graph: { nodes: [inner] } }) }) as unknown as NonNullable<Parameters<typeof automationStudioAttemptsMayHaveActedLastingly>[0]["subflowGraphs"]>;
    await expect(asked([call], [called], { subflowGraphs: graph(node("inner")) })).resolves.toBe(false);
    await expect(asked([call], [called], { subflowGraphs: graph(node("inner", { metadata: { declaredConsequences: ["send_message"] } })) })).resolves.toBe(true);
    await expect(asked([call], [called])).resolves.toBe(true);
  });

  it("counts a domain step that is not in this graph, and passes over Core's own", async () => {
    await expect(asked([], [attempt("elsewhere")])).resolves.toBe(true);
    await expect(asked([], [attempt("merge", { definitionId: "builtin.control.merge" })])).resolves.toBe(false);
  });
});
