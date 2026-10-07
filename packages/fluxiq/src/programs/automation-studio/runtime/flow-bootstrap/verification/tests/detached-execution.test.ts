import { describe, expect, it } from "vitest";
import { createBlankAutomationStudioFlowArtifact } from "../../../../model/index.ts";
import { AutomationStudioNodeRegistry, canonicalBuiltinAutomationNodeDefinitions, type AutomationStudioNodeDefinition } from "../../../../nodes/index.ts";
import { validateAutomationStudioFlowBootstrapPlan, type AutomationStudioFlowBootstrapPlan } from "../../plan/index.ts";
import { runAutomationStudioDetachedCandidate } from "../index.ts";

function fixture() {
  const parentFlow = createBlankAutomationStudioFlowArtifact({ flowId: "parent", projectId: "project", name: "Parent", now: 1 });
  const resolution = { scope: parentFlow.scope, runtimeCapabilities: [] as string[], permissions: [] as string[] };
  const plan: AutomationStudioFlowBootstrapPlan = {
    schemaVersion: "0.1", router: { name: "route", rules: [], fallback: { kind: "subflow", targetSubflowKey: "primary" } },
    subflows: [{ key: "primary", name: "Primary", role: "primary", nodes: [
      { key: "start", definitionId: "builtin.control.start", definitionVersion: "1.0.0" },
      { key: "value", definitionId: "builtin.data.constant", definitionVersion: "1.0.0", parameters: { value: "submitted" } }
    ], edges: [{ key: "next", source: { nodeKey: "start", portId: "success" }, target: { nodeKey: "value", portId: "in" } }] }]
  };
  const buildPlan = validateAutomationStudioFlowBootstrapPlan({ plan, resolution }).validated!;
  expect(buildPlan).toBeDefined();
  const identity = { projectId: "project", flowId: "parent", revision: 1, digest: "trusted-digest", baseDependencyDigest: "base", requirementsDigest: "requirements" };
  const input: Parameters<typeof runAutomationStudioDetachedCandidate>[0] = { parentFlow, resolution, identity,
    candidate: { revision: 1, digest: identity.digest, baseDependencyDigest: "base", buildPlan },
    currentIdentity: async () => identity, snapshots: [], sourceInstructionIds: ["instruction"], runId: "run1",
    start: { receiptId: "start", preparedAt: 1, conditionsDigest: "conditions", pageGeneration: 1, subjectStates: [] }, options: { now: () => 100 }
  };
  const recompile = () => { input.candidate.buildPlan = validateAutomationStudioFlowBootstrapPlan({ plan, resolution }).validated!; expect(input.candidate.buildPlan).toBeDefined(); };
  return { input, plan, recompile };
}

describe("detached candidate normal execution", () => {
  it("executes the submitted multi-node graph without reading or mutating the accepted parent", async () => {
    const { input } = fixture();
    input.parentFlow.nodes = [{ id: "accepted", definitionId: "builtin.data.constant", parameterValues: { value: "accepted-old" } }];
    const before = structuredClone(input.parentFlow);
    const result = await runAutomationStudioDetachedCandidate(input);
    expect(result.receipt).toMatchObject({ status: "succeeded", executedNodeCount: 2, commands: [], runId: "run1" });
    expect(result.trace?.values.value).toBe("submitted");
    expect(result.trace?.attempts.map((attempt) => attempt.definitionId)).toEqual(["builtin.control.start", "builtin.data.constant"]);
    expect(input.parentFlow).toEqual(before);
    const again = await runAutomationStudioDetachedCandidate({ ...input, runId: "run2" });
    expect(again.trace?.attempts.map((attempt) => attempt.nodeId)).toEqual(result.trace?.attempts.map((attempt) => attempt.nodeId));
  });

  it("returns the selected graph that ran, so a trial can say what each step did, and none when nothing ran", async () => {
    const { input } = fixture();
    const result = await runAutomationStudioDetachedCandidate(input);
    expect(result.graph?.nodes.map((node) => node.id)).toEqual(result.trace?.attempts.map((attempt) => attempt.nodeId));
    expect(result.graph?.metadata).toMatchObject({ parentFlowId: "parent", subflowGraph: true });
    input.candidate.revision = 2;
    expect(await runAutomationStudioDetachedCandidate(input)).not.toHaveProperty("graph");
  });

  it("routes only the selected submitted subflow and never requires unselected branch outputs", async () => {
    const { input, plan, recompile } = fixture();
    plan.subflows.push({ key: "alternate", name: "Alternate", role: "fallback", nodes: [{ key: "alt", definitionId: "builtin.data.constant", definitionVersion: "1.0.0", parameters: { value: "alternate" } }], edges: [] });
    plan.router.rules = [{ key: "alt", name: "Alt", targetSubflowKey: "alternate", routeTags: [], condition: { signalPath: "inputs.alt", operator: "equals", expected: true } }];
    recompile(); input.options!.inputs = { alt: true };
    const result = await runAutomationStudioDetachedCandidate(input);
    expect(result.receipt.status).toBe("succeeded");
    expect(result.receipt.executedNodeCount).toBe(1);
    expect(result.trace?.values.value).toBe("alternate");
    expect(result.trace?.attempts[0]?.nodeId).toContain("alternate");
  });

  it("refuses host-state routing fallback even if caller inputs contain a matching stale state", async () => {
    const { input, plan, recompile } = fixture();
    plan.router.rules = [{ key: "state", name: "State", targetSubflowKey: "primary", routeTags: [], condition: { signalPath: "state.ready", operator: "equals", expected: true } }];
    recompile(); input.options!.inputs = { state: { ready: true } };
    const result = await runAutomationStudioDetachedCandidate(input);
    expect(result).toMatchObject({ code: "candidate.routing_state_unavailable", receipt: { status: "not_run", executedNodeCount: 0 } });
  });

  it("honors fresh trusted host observations rather than caller state", async () => {
    const { input, plan, recompile } = fixture();
    plan.router.rules = [{ key: "state", name: "State", targetSubflowKey: "primary", routeTags: [], condition: { signalPath: "state.ready", operator: "equals", expected: true } }];
    plan.router.fallback = { kind: "fail" }; recompile();
    input.options!.hostRuntime = { capabilities: [], observeRouteState: async () => ({ ready: true }) };
    const result = await runAutomationStudioDetachedCandidate(input);
    expect(result.receipt.status).toBe("succeeded");
    expect(result.route?.decision.metadata?.routeState).toMatchObject({ observed: true });
  });

  it.each(["project", "flow", "scope", "base", "revision"])("refuses mismatched %s ownership before dispatch", async (field) => {
    const { input } = fixture();
    if (field === "project") input.parentFlow.projectId = "other";
    if (field === "flow") input.parentFlow.flowId = "other";
    if (field === "scope") input.resolution.scope = { kind: "domain", domainId: "other" };
    if (field === "base") input.candidate.baseDependencyDigest = "other";
    if (field === "revision") input.candidate.revision = 2;
    expect(await runAutomationStudioDetachedCandidate(input)).toMatchObject({ code: "candidate.execution_identity_mismatch", receipt: { executedNodeCount: 0 } });
  });

  it.each(["definition", "edge", "router", "layout"])("refuses invalid or rewritten %s topology before execution", async (kind) => {
    const { input } = fixture();
    if (kind === "definition") input.candidate.buildPlan.plan.subflows[0]!.nodes[1]!.definitionId = "unavailable";
    if (kind === "edge") input.candidate.buildPlan.plan.subflows[0]!.edges[0]!.target.nodeKey = "absent";
    if (kind === "router") input.candidate.buildPlan.plan.router.fallback = { kind: "subflow", targetSubflowKey: "absent" };
    if (kind === "layout") input.candidate.buildPlan.subflows[0]!.nodes[1]!.parameters = { value: "swapped-outside-plan" };
    const result = await runAutomationStudioDetachedCandidate(input);
    expect(result.receipt.status).toBe("not_run"); expect(result.receipt.executedNodeCount).toBe(0);
    expect(result.code).toBe(kind === "layout" ? "candidate.execution_plan_rewritten" : "candidate.execution_plan_invalid");
  });

  it.each(["startNodeId", "stopAfterNodeId", "priorAttemptCount"])("refuses partial option %s", async (field) => {
    const { input } = fixture(); Object.assign(input.options!, { [field]: field === "priorAttemptCount" ? 1 : "value" });
    expect(await runAutomationStudioDetachedCandidate(input)).toMatchObject({ code: "candidate.partial_execution_unsupported", receipt: { executedNodeCount: 0 } });
  });

  it("refuses a changed accepted base before execution", async () => {
    const { input } = fixture(); input.currentIdentity = async () => ({ ...input.identity, baseDependencyDigest: "changed" });
    expect(await runAutomationStudioDetachedCandidate(input)).toMatchObject({ code: "candidate.execution_stale", receipt: { executedNodeCount: 0 } });
  });

  it("honors cancellation before dispatch and while observing the routing host", async () => {
    const { input, plan, recompile } = fixture(); const controller = new AbortController(); input.signal = controller.signal;
    controller.abort(); expect((await runAutomationStudioDetachedCandidate(input)).receipt.status).toBe("cancelled");
    const active = new AbortController(); input.signal = active.signal;
    plan.router.rules = [{ key: "state", name: "State", targetSubflowKey: "primary", routeTags: [], condition: { signalPath: "state.ready", operator: "equals", expected: true } }]; recompile();
    input.options!.hostRuntime = { capabilities: [], observeRouteState: async ({ signal }) => { expect(signal).toBe(active.signal); active.abort(); return { ready: true }; } };
    expect(await runAutomationStudioDetachedCandidate(input)).toMatchObject({ receipt: { status: "cancelled", executedNodeCount: 0 } });
  });

  it("refuses max-step partial completion", async () => {
    const { input } = fixture(); input.options!.maxSteps = 1;
    const result = await runAutomationStudioDetachedCandidate(input);
    expect(result.receipt.status).toBe("failed"); expect(result.receipt.executedNodeCount).toBe(1);
  });

  it.each(["success", "waiting", "failed", "cancel"] as const)("runs the real native/effect boundary with %s outcome without fabricating command receipts", async (outcome) => {
    const { input, plan } = fixture();
    const definition: AutomationStudioNodeDefinition = { schemaVersion: "0.1", id: "custom.native", version: "1.0.0", label: "Native", description: "Test native boundary", category: "action",
      source: { kind: "code", moduleId: "test", implementationKey: "test.native", trust: "trusted-local" }, availability: { kind: "global" }, capabilities: { executable: true },
      safety: { requiredPermissions: ["test.allowed"] }, inputs: [{ id: "in", label: "In", valueType: "any" }], outputs: [{ id: "success", label: "Success", valueType: "any" }], parameters: [] };
    input.registry = new AutomationStudioNodeRegistry([...canonicalBuiltinAutomationNodeDefinitions, definition]);
    input.resolution.permissions = ["test.allowed"];
    plan.subflows[0]!.nodes[1] = { key: "native", definitionId: definition.id, definitionVersion: definition.version, consequences: [] };
    plan.subflows[0]!.edges[0]!.target.nodeKey = "native";
    input.candidate.buildPlan = validateAutomationStudioFlowBootstrapPlan({ plan, resolution: input.resolution, registry: input.registry }).validated!;
    expect(input.candidate.buildPlan).toBeDefined();
    const controller = new AbortController(); input.signal = controller.signal;
    let nativeCalls = 0, effectCalls = 0;
    input.options!.nativeNodeExecutor = async ({ node, signal, hostContext }) => {
      nativeCalls++; expect(node.definitionId).toBe(definition.id); expect(signal).toBeDefined(); expect(hostContext?.sideEffectClass).toBeDefined();
      if (outcome === "cancel") { controller.abort(); return { result: { status: "success", outputs: {} } }; }
      return { result: { status: outcome, route: outcome === "success" ? "success" : outcome, outputs: {}, ...(outcome === "success" ? { effects: [{ type: "test.command", payload: { subject: "synthetic" } }] } : {}) } };
    };
    input.options!.effectDispatcher = (effect, context) => { effectCalls++; expect(effect.type).toBe("test.command"); expect(context?.signal).toBeDefined(); return { status: "success", route: "success", outputs: {} }; };
    const result = await runAutomationStudioDetachedCandidate(input);
    expect(nativeCalls).toBe(1); expect(effectCalls).toBe(outcome === "success" ? 1 : 0);
    expect(result.receipt.status).toBe(outcome === "success" ? "succeeded" : outcome === "cancel" ? "cancelled" : "failed");
    expect(result.receipt.commands).toEqual([]);
  });

  it("does not bypass native registry permissions", async () => {
    const { input, plan } = fixture();
    const definition: AutomationStudioNodeDefinition = { schemaVersion: "0.1", id: "custom.privileged", version: "1.0.0", label: "Privileged", description: "Permission probe", category: "action",
      source: { kind: "code", moduleId: "test", implementationKey: "test", trust: "trusted-local" }, availability: { kind: "global" }, capabilities: { executable: true },
      safety: { requiredPermissions: ["not.authorized"] }, inputs: [], outputs: [], parameters: [] };
    input.registry = new AutomationStudioNodeRegistry([...canonicalBuiltinAutomationNodeDefinitions, definition]);
    input.candidate.buildPlan.plan.subflows[0]!.nodes[1]!.definitionId = definition.id;
    let dispatched = false; input.options!.nativeNodeExecutor = async () => { dispatched = true; return { result: { status: "success", outputs: {} } }; };
    expect((await runAutomationStudioDetachedCandidate(input)).receipt.status).toBe("not_run"); expect(dispatched).toBe(false);
  });

  it("refuses a revision that changes while the routing host is observed", async () => {
    const { input, plan, recompile } = fixture(); let current = input.identity;
    input.currentIdentity = async () => current;
    plan.router.rules = [{ key: "state", name: "State", targetSubflowKey: "primary", routeTags: [], condition: { signalPath: "state.ready", operator: "equals", expected: true } }]; recompile();
    input.options!.hostRuntime = { capabilities: [], observeRouteState: async () => { current = { ...current, revision: 2 }; return { ready: true }; } };
    expect(await runAutomationStudioDetachedCandidate(input)).toMatchObject({ code: "candidate.execution_stale", receipt: { status: "not_run", executedNodeCount: 0 } });
  });

  it("never accepts a replacement graph from an injected composite executor", async () => {
    const { input } = fixture(); let called = false;
    input.options!.compositeExecutor = async () => { called = true; return { result: { status: "success", outputs: {} } }; };
    expect(await runAutomationStudioDetachedCandidate(input)).toMatchObject({ code: "candidate.partial_execution_unsupported", receipt: { executedNodeCount: 0 } });
    expect(called).toBe(false);
  });

  it("preserves completed execution facts when the subsequent owner read fails", async () => {
    const { input } = fixture(); let reads = 0;
    input.currentIdentity = async () => { if (++reads === 3) throw new Error("synthetic owner unavailable"); return input.identity; };
    const result = await runAutomationStudioDetachedCandidate(input);
    expect(result).toMatchObject({ code: "candidate.execution_error", receipt: { status: "failed", executedNodeCount: 2, commands: [] }, trace: { status: "succeeded" } });
  });
});
