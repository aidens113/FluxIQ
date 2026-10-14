import { createBlankAutomationStudioFlowArtifact } from "../../../../model/index.ts";
import { automationNodeStateBinding, AutomationStudioNodeRegistry, canonicalBuiltinAutomationNodeDefinitions, type AutomationStudioNodeDefinition } from "../../../../nodes/index.ts";
import type { JsonValue } from "../../../../../../core/index.ts";
import { validateAutomationStudioFlowBootstrapPlan, type AutomationStudioFlowBootstrapPlan, type AutomationStudioFlowBootstrapSubflow } from "../../plan/index.ts";
import { runAutomationStudioDetachedCandidate } from "../index.ts";

/** A generic submitted topology, with two calls to a part which itself calls another part. */
export function candidateSubflowFixture() {
  const parentFlow = createBlankAutomationStudioFlowArtifact({ flowId: "parent", projectId: "project", name: "Parent", now: 1 });
  const resolution = { scope: parentFlow.scope, runtimeCapabilities: [] as string[], permissions: [] as string[] };
  const constant = canonicalBuiltinAutomationNodeDefinitions.find((definition) => definition.id === "builtin.data.constant")!;
  const echo: AutomationStudioNodeDefinition = { ...constant, id: "test.echo", source: { kind: "code", moduleId: "test", implementationKey: "echo", trust: "trusted-local" } };
  const registry = new AutomationStudioNodeRegistry([...canonicalBuiltinAutomationNodeDefinitions, echo]);
  const contract = (path: string) => ({ inputs: [{ id: "item", name: "Item", valueType: { kind: "unknown" as const }, required: true as const }], outputs: [{ id: "value", name: "Value", valueType: { kind: "unknown" as const }, metadata: { binding: automationNodeStateBinding(path) } }] });
  const chain = (key: string, role: AutomationStudioFlowBootstrapSubflow["role"], nodes: AutomationStudioFlowBootstrapSubflow["nodes"]): AutomationStudioFlowBootstrapSubflow => ({
    key, name: key, role, nodes,
    edges: nodes.slice(1).map((node, index) => ({ key: `edge${index}`, source: { nodeKey: nodes[index]!.key, portId: "success" }, target: { nodeKey: node.key, portId: "in" } }))
  });
  const start = { key: "start", definitionId: "builtin.control.start", definitionVersion: "1.0.0" };
  const primary = chain("main", "primary", [start,
    { key: "first", definitionId: "builtin.control.call-subflow", definitionVersion: "1.0.0", parameters: { subflowId: "middle", inputs: { item: 11 }, outputs: { value: "firstResult" } } },
    { key: "second", definitionId: "builtin.control.call-subflow", definitionVersion: "1.0.0", parameters: { subflowId: "middle", inputs: { item: 22 }, outputs: { value: "secondResult" } } },
    { key: "consume", definitionId: "test.echo", definitionVersion: "1.0.0", parameters: { value: { first: automationNodeStateBinding("firstResult"), second: automationNodeStateBinding("secondResult") } } }
  ]);
  const middle = { ...chain("middle", "utility", [start,
    { key: "call", definitionId: "builtin.control.call-subflow", definitionVersion: "1.0.0", parameters: { subflowId: "leaf", inputs: { item: automationNodeStateBinding("item") }, outputs: { value: "value" } } }
  ]), interface: contract("$node.call.value") };
  const leaf = { ...chain("leaf", "utility", [start,
    { key: "value", definitionId: "test.echo", definitionVersion: "1.0.0", parameters: { value: automationNodeStateBinding("item") } }
  ]), interface: contract("$node.value.value") };
  const plan: AutomationStudioFlowBootstrapPlan = { schemaVersion: "0.1", router: { name: "Entry", rules: [], fallback: { kind: "subflow", targetSubflowKey: "main" } }, subflows: [primary, middle, leaf] };
  const identity = { projectId: "project", flowId: "parent", revision: 1, digest: "candidate-digest", baseDependencyDigest: "base", requirementsDigest: "task" };
  const validated = validateAutomationStudioFlowBootstrapPlan({ plan, resolution, registry });
  if (!validated.validated) throw new Error("Generic candidate fixture failed validation.");
  const seen: JsonValue[] = [];
  const input: Parameters<typeof runAutomationStudioDetachedCandidate>[0] = { parentFlow, resolution, registry, identity, candidate: { revision: 1, digest: identity.digest, baseDependencyDigest: "base", buildPlan: validated.validated }, currentIdentity: async () => identity, snapshots: [], sourceInstructionIds: ["task"], runId: "trial", start: { receiptId: "start", conditionsDigest: "start-state", preparedAt: 1, pageGeneration: 0, subjectStates: [] }, options: { now: () => 2, nativeNodeExecutor: async ({ node }) => {
    const value = node.parameterValues?.value ?? null;
    seen.push(value);
    return { result: { status: "success", route: "success", outputs: { value } } };
  } } };
  return { input, plan, seen, recompile: () => {
    const result = validateAutomationStudioFlowBootstrapPlan({ plan, resolution, ...(input.registry ? { registry: input.registry } : {}) });
    if (!result.validated) throw new Error("Generic candidate fixture failed revalidation.");
    input.candidate.buildPlan = result.validated;
  } };
}
