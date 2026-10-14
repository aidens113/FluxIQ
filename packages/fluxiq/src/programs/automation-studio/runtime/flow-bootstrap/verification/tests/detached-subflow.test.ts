import { describe, expect, it } from "vitest";
import type { JsonValue } from "../../../../../../core/index.ts";
import { createBlankAutomationStudioFlowArtifact } from "../../../../model/index.ts";
import { automationNodeStateBinding, AutomationStudioNodeRegistry, canonicalBuiltinAutomationNodeDefinitions, type AutomationStudioNodeDefinition } from "../../../../nodes/index.ts";
import type { AutomationStudioFlowBootstrapSubflow } from "../../plan/index.ts";
import {
  automationStudioDetachedSubflowCandidateIdentity,
  runAutomationStudioDetachedSubflow,
  type AutomationStudioDetachedSubflowIdentity,
  type AutomationStudioDetachedSubflowInput
} from "../index.ts";

// A structure plan's subflow tried on its own: a predecessor that finds an
// item, then the target that is handed it across the part boundary.

const port = (id: string, binding?: string) => ({ id, name: id, valueType: { kind: "unknown" as const }, ...(binding ? { metadata: { binding: automationNodeStateBinding(binding) } } : {}) });

function chain(key: string, role: AutomationStudioFlowBootstrapSubflow["role"], nodes: AutomationStudioFlowBootstrapSubflow["nodes"]): AutomationStudioFlowBootstrapSubflow {
  return { key, name: key, role, nodes, edges: nodes.slice(1).map((node, index) => ({ key: `edge${index}`, source: { nodeKey: nodes[index]!.key, portId: "success" }, target: { nodeKey: node.key, portId: "in" } })) };
}

/** A caller's accepted-graph source that counts every read; a partial trial must never ask it. */
function acceptedSource() {
  let reads = 0;
  const read = async () => {
    reads += 1;
    return undefined;
  };
  return { source: { load: read, recovery: read }, reads: () => reads };
}

function fixture() {
  const parentFlow = createBlankAutomationStudioFlowArtifact({ flowId: "parent", projectId: "project", name: "Parent", now: 1 });
  const resolution = { scope: parentFlow.scope, runtimeCapabilities: [] as string[], permissions: [] as string[] };
  const constant = canonicalBuiltinAutomationNodeDefinitions.find((definition) => definition.id === "builtin.data.constant")!;
  const echo: AutomationStudioNodeDefinition = { ...constant, id: "test.echo", source: { kind: "code", moduleId: "test", implementationKey: "echo", trust: "trusted-local" } };
  const registry = new AutomationStudioNodeRegistry([...canonicalBuiltinAutomationNodeDefinitions, echo]);
  const start = { key: "start", definitionId: "builtin.control.start", definitionVersion: "1.0.0" };
  const find = { ...chain("find", "primary", [start, { key: "found", definitionId: "test.echo", definitionVersion: "1.0.0", parameters: { value: "hub" } }]), interface: { inputs: [], outputs: [port("item", "$node.found.value")] } };
  const add = { ...chain("add", "utility", [start, { key: "added", definitionId: "test.echo", definitionVersion: "1.0.0", parameters: { value: { adding: automationNodeStateBinding("item") } } }]), interface: { inputs: [{ ...port("item"), required: true as const }], outputs: [] } };
  const identity: AutomationStudioDetachedSubflowIdentity = {
    projectId: "project", flowId: "parent", buildId: "build.1", briefId: "brief.add", planDigest: "plan.1", baseDependencyDigest: "base",
    target: { subflowKey: "add", revision: 2, digest: "add.2" }, predecessors: [{ subflowKey: "find", revision: 1, digest: "find.1" }]
  };
  const seen: JsonValue[] = [];
  let failing: JsonValue | undefined;
  const input: AutomationStudioDetachedSubflowInput = {
    identity, target: { subflowKey: "add", revision: 2, digest: "add.2", subflows: [add] }, predecessors: [{ subflowKey: "find", revision: 1, digest: "find.1", subflows: [find] }],
    currentIdentity: async () => identity, parentFlow, registry, resolution, snapshots: [], sourceInstructionIds: ["task"], runId: "subflow-trial",
    start: { receiptId: "start", conditionsDigest: "start-state", preparedAt: 1, pageGeneration: 0, subjectStates: [] },
    options: { now: () => 2, nativeNodeExecutor: async ({ node }) => {
      const value = node.parameterValues?.value ?? null;
      seen.push(value);
      if (failing !== undefined && JSON.stringify(value) === JSON.stringify(failing)) {
        return { result: { status: "failed", route: "failed", outputs: {}, failure: { category: "action_failed", code: "test.failed", retryable: false, stage: "execution" } } };
      }
      return { result: { status: "success", route: "success", outputs: { value } } };
    } }
  };
  return { input, identity, seen, find, add, failWhen: (value: JsonValue) => { failing = value; } };
}

describe("detached subflow partial trial", () => {
  it("runs the predecessor's proposal, then the target with its input read from the predecessor's output, from the candidate topology alone", async () => {
    const { input, seen } = fixture();
    const accepted = acceptedSource();
    input.options!.subflowGraphs = accepted.source;
    const before = structuredClone(input.parentFlow);
    const result = await runAutomationStudioDetachedSubflow(input);
    expect(result).toMatchObject({ partial: true, entryPrepared: true, receipt: { status: "succeeded", runId: "subflow-trial" } });
    expect(result.code).toBeUndefined();
    expect(seen).toEqual(["hub", { adding: "hub" }]);
    expect(accepted.reads()).toBe(0);
    expect(input.parentFlow).toEqual(before);
    // The root that ran is the throwaway of calls; each part ran as its own frame.
    const calls = result.trace?.attempts.filter((attempt) => attempt.subflowTarget) ?? [];
    expect(calls.map((attempt) => attempt.childTrace?.status)).toEqual(["succeeded", "succeeded"]);
    expect(result.candidateGraphs?.map((graph) => graph.metadata?.bootstrapSymbolicKey)).toEqual(["subflow-trial-root", "find", "add"]);
    // The receipt is bound to the partial identity, never the target's own digest.
    expect(result.receipt.identity).toEqual(automationStudioDetachedSubflowCandidateIdentity(input.identity));
    expect(result.receipt.identity.digest).not.toBe("add.2");
  });

  it("refuses a target calling a subflow outside the composed topology before anything runs, reading no accepted graph", async () => {
    const { input, add, seen } = fixture();
    add.nodes[1] = { key: "added", definitionId: "builtin.control.call-subflow", definitionVersion: "1.0.0", parameters: { subflowId: "checkout", inputs: {}, outputs: {} } };
    input.target = { ...input.target, subflows: [add] };
    const accepted = acceptedSource();
    input.options!.subflowGraphs = accepted.source;
    const result = await runAutomationStudioDetachedSubflow(input);
    expect(result).toMatchObject({ partial: true, code: "candidate.execution_plan_invalid", entryPrepared: false, receipt: { status: "not_run", executedNodeCount: 0 } });
    expect(result.planIssues).toContain("bootstrap.unknown_call_target");
    expect(accepted.reads()).toBe(0);
    expect(seen).toEqual([]);
  });

  it("does not run the target when a predecessor fails, and names the predecessor", async () => {
    const { input, seen, failWhen } = fixture();
    failWhen("hub");
    const result = await runAutomationStudioDetachedSubflow(input);
    expect(result).toMatchObject({ partial: true, entryPrepared: false, failedPredecessor: "find", receipt: { status: "failed" } });
    expect(seen).toEqual(["hub"]);
  });

  it("answers a prepared entry when the target itself fails", async () => {
    const { input, failWhen } = fixture();
    failWhen({ adding: "hub" });
    const result = await runAutomationStudioDetachedSubflow(input);
    expect(result).toMatchObject({ entryPrepared: true, receipt: { status: "failed" } });
    expect(result.failedPredecessor).toBeUndefined();
  });

  it("refuses proposals that are not the ones the identity names", async () => {
    const { input, seen } = fixture();
    const wrongRevision = await runAutomationStudioDetachedSubflow({ ...input, target: { ...input.target, revision: 3 } });
    const wrongPredecessor = await runAutomationStudioDetachedSubflow({ ...input, predecessors: [{ ...input.predecessors[0]!, digest: "find.0" }] });
    const missingPredecessor = await runAutomationStudioDetachedSubflow({ ...input, predecessors: [] });
    const wrongHead = await runAutomationStudioDetachedSubflow({ ...input, target: { ...input.target, subflowKey: "find" } });
    for (const result of [wrongRevision, wrongPredecessor, missingPredecessor, wrongHead]) {
      expect(result).toMatchObject({ partial: true, code: "subflow.execution_identity_mismatch", entryPrepared: false, receipt: { status: "not_run" } });
    }
    expect(seen).toEqual([]);
  });

  it("refuses a trial whose binding moved before it began, and stops one whose predecessor changed while it ran", async () => {
    const { input, identity, seen } = fixture();
    const amended = await runAutomationStudioDetachedSubflow({ ...input, currentIdentity: async () => ({ ...identity, planDigest: "plan.2" }) });
    expect(amended).toMatchObject({ code: "candidate.execution_stale", receipt: { status: "not_run" } });
    expect(seen).toEqual([]);
    let current = identity;
    const native = input.options!.nativeNodeExecutor!;
    input.options!.nativeNodeExecutor = async (request) => {
      const result = await native(request);
      current = { ...identity, predecessors: [{ subflowKey: "find", revision: 2, digest: "find.2" }] };
      return result;
    };
    const moved = await runAutomationStudioDetachedSubflow({ ...input, currentIdentity: async () => current });
    expect(moved).toMatchObject({ code: "candidate.execution_stale", receipt: { status: "failed" } });
    expect(moved.entryPrepared).toBe(false);
    expect(seen).toEqual(["hub"]);
  });

  it("refuses a required input no predecessor produces", async () => {
    const { input, identity, seen } = fixture();
    const alone = await runAutomationStudioDetachedSubflow({ ...input, identity: { ...identity, predecessors: [] }, predecessors: [], currentIdentity: async () => ({ ...identity, predecessors: [] }) });
    expect(alone).toMatchObject({ code: "subflow.execution_input_unbound", entryPrepared: false, receipt: { status: "not_run" } });
    expect(seen).toEqual([]);
  });

  it("leaves partial options to the whole runner's refusal, which still holds", async () => {
    const { input, seen } = fixture();
    const result = await runAutomationStudioDetachedSubflow({ ...input, options: { ...input.options, startNodeId: "node" } });
    expect(result).toMatchObject({ code: "candidate.partial_execution_unsupported", entryPrepared: false });
    expect(seen).toEqual([]);
  });

  describe("a target with no interface, which the router runs", () => {
    /** The fixture with its target replaced by an interface-less `finish`, with or without the `find` predecessor. */
    function routerRun(withPredecessor: boolean): AutomationStudioDetachedSubflowInput & { seen: JsonValue[]; failWhen(value: JsonValue): void } {
      const { input, identity: base, seen, failWhen } = fixture();
      const finish = chain("finish", "fallback", [{ key: "start", definitionId: "builtin.control.start", definitionVersion: "1.0.0" }, { key: "done", definitionId: "test.echo", definitionVersion: "1.0.0", parameters: { value: "done" } }]);
      const identity: AutomationStudioDetachedSubflowIdentity = { ...base, briefId: "brief.finish", target: { subflowKey: "finish", revision: 1, digest: "finish.1" }, predecessors: withPredecessor ? base.predecessors : [] };
      return { ...input, identity, currentIdentity: async () => identity, target: { subflowKey: "finish", revision: 1, digest: "finish.1", subflows: [finish] }, predecessors: withPredecessor ? input.predecessors : [], seen, failWhen };
    }
    const ownSteps = (result: Awaited<ReturnType<typeof runAutomationStudioDetachedSubflow>>) => result.trace?.attempts.filter((attempt) => !attempt.subflowTarget && attempt.nodeId.includes(".finish.")) ?? [];

    it("runs the predecessor's call, then the target as a root frame of its own, answered as one run", async () => {
      const input = routerRun(true);
      const accepted = acceptedSource();
      input.options!.subflowGraphs = accepted.source;
      const result = await runAutomationStudioDetachedSubflow(input);
      expect(result).toMatchObject({ partial: true, entryPrepared: true, receipt: { status: "succeeded" } });
      expect(input.seen).toEqual(["hub", "done"]);
      // The target's steps are root attempts, never a called frame; the predecessor's call comes first in the one trace.
      expect(ownSteps(result).map((attempt) => attempt.definitionId)).toEqual(["builtin.control.start", "test.echo"]);
      expect(result.trace?.attempts[1]?.subflowTarget).toBeDefined();
      expect(result.receipt.executedNodeCount).toBe(6);
      expect(result.graph?.nodes.some((node) => node.id.includes(".finish."))).toBe(true);
      expect(result.graph?.nodes.some((node) => node.id.includes(".subflow-trial-root."))).toBe(true);
      expect(accepted.reads()).toBe(0);
    });

    it("never starts the target's run when its predecessor fails", async () => {
      const input = routerRun(true);
      input.failWhen("hub");
      const result = await runAutomationStudioDetachedSubflow(input);
      expect(result).toMatchObject({ entryPrepared: false, failedPredecessor: "find", receipt: { status: "failed" } });
      expect(input.seen).toEqual(["hub"]);
      expect(ownSteps(result)).toEqual([]);
    });

    it("runs a target with no predecessors as the root frame alone", async () => {
      const input = routerRun(false);
      const result = await runAutomationStudioDetachedSubflow(input);
      expect(result).toMatchObject({ entryPrepared: true, receipt: { status: "succeeded", executedNodeCount: 2 } });
      expect(input.seen).toEqual(["done"]);
      expect(ownSteps(result)).toHaveLength(2);
    });
  });
});
