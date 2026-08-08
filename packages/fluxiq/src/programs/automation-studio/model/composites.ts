import { createHash } from "node:crypto";
import type { JsonObject } from "../../../core/index.ts";
import type { AutomationStudioFlowArtifact, AutomationStudioFlowInterface, AutomationStudioFlowScope } from "./flows.ts";
import type { AutomationStudioFlowNode } from "./artifacts.ts";
import type { AutomationStudioValidationIssue, AutomationStudioValidationResult } from "./validation.ts";
import type { AutomationStudioNodeDefinition } from "../nodes/definitions.ts";

export type AutomationStudioPublishedFlowSnapshot = {
  schemaVersion: "0.1";
  flowId: string;
  version: string;
  name: string;
  description?: string;
  scope: AutomationStudioFlowScope;
  publishedAt: number;
  flowDigest: string;
  publishedBy?: string;
  changelog?: string;
  dependencies?: Array<{ flowId: string; version: string; flowDigest?: string }>;
  requiredRuntimeCapabilities?: string[];
  executionDefaults?: AutomationStudioFlowArtifact["executionDefaults"];
  interface: AutomationStudioFlowInterface;
  errors: AutomationStudioFlowArtifact["errors"];
  nodes: AutomationStudioFlowArtifact["nodes"];
  edges: AutomationStudioFlowArtifact["edges"];
  regions?: AutomationStudioFlowArtifact["regions"];
  regionHandoffs?: AutomationStudioFlowArtifact["regionHandoffs"];
};

/** Mutable lifecycle metadata around an immutable published snapshot. */
export type AutomationStudioFlowPublicationRecord = {
  schemaVersion: "0.1";
  publicationId: string;
  projectId: string;
  flowId: string;
  version: string;
  status: "published" | "deprecated";
  snapshot: AutomationStudioPublishedFlowSnapshot;
  createdAt: number;
  deprecatedAt?: number;
  deprecationReason?: string;
};

export type AutomationStudioCallFlowTarget = { flowId: string; version: string; scope: AutomationStudioFlowScope };
export type AutomationStudioCallFlowBinding = { targetPortId: string; valueKey: string };
export type AutomationStudioCallFlowConfiguration = { target: AutomationStudioCallFlowTarget; inputBindings?: AutomationStudioCallFlowBinding[]; outputBindings?: AutomationStudioCallFlowBinding[]; errorBindings?: AutomationStudioCallFlowBinding[] };

const callFlowMetadataKey = "fluxiq.callFlow";

export function createPublishedFlowSnapshot(flow: AutomationStudioFlowArtifact, version: string, publishedAt = Date.now(), metadata: { publishedBy?: string; changelog?: string; dependencyDigests?: Map<string, string>; requiredRuntimeCapabilities?: Iterable<string> } = {}): AutomationStudioPublishedFlowSnapshot {
  const interfaceSnapshot = structuredClone(flow.interface);
  const dependenciesById = new Map<string, { flowId: string; version: string; flowDigest?: string }>();
  for (const node of flow.nodes) {
    const call = getCallFlowConfiguration(node);
    if (!call) continue;
    const key = `${call.target.flowId}@${call.target.version}`;
    const dependencyDigest = metadata.dependencyDigests?.get(key);
    dependenciesById.set(key, { flowId: call.target.flowId, version: call.target.version, ...(dependencyDigest ? { flowDigest: dependencyDigest } : {}) });
  }
  const dependencies = [...dependenciesById.values()];
  const requiredRuntimeCapabilities = [...new Set([...(flow.regions ?? []).flatMap((region) => region.requiredRuntimeCapabilities ?? []), ...(metadata.requiredRuntimeCapabilities ?? [])])].sort();
  const digest = digestFlowPublication({ flowId: flow.flowId, version, scope: flow.scope, interface: interfaceSnapshot, errors: flow.errors, nodes: flow.nodes, edges: flow.edges, regions: flow.regions, regionHandoffs: flow.regionHandoffs, executionDefaults: flow.executionDefaults, dependencies, requiredRuntimeCapabilities });
  return { schemaVersion: "0.1", flowId: flow.flowId, version, name: flow.name, ...(flow.description ? { description: flow.description } : {}), scope: structuredClone(flow.scope), publishedAt, flowDigest: digest, ...(metadata.publishedBy ? { publishedBy: metadata.publishedBy } : {}), ...(metadata.changelog ? { changelog: metadata.changelog } : {}), dependencies, requiredRuntimeCapabilities, ...(flow.executionDefaults ? { executionDefaults: structuredClone(flow.executionDefaults) } : {}), interface: interfaceSnapshot, errors: structuredClone(flow.errors), nodes: structuredClone(flow.nodes), edges: structuredClone(flow.edges), ...(flow.regions ? { regions: structuredClone(flow.regions) } : {}), ...(flow.regionHandoffs ? { regionHandoffs: structuredClone(flow.regionHandoffs) } : {}) };
}

export function compositeNodeDefinitionId(target: Pick<AutomationStudioCallFlowTarget, "flowId" | "version">): string {
  return `composite.flow.${encodeURIComponent(target.flowId)}@${target.version}`;
}

/** Projects a frozen public Flow version into a palette-safe node definition. */
export function projectPublishedFlowSnapshotToNodeDefinition(snapshot: AutomationStudioPublishedFlowSnapshot): AutomationStudioNodeDefinition {
  return {
    schemaVersion: "0.1", id: compositeNodeDefinitionId(snapshot), version: snapshot.version, label: snapshot.name,
    description: snapshot.description ?? `Call published Flow ${snapshot.flowId}@${snapshot.version}.`, category: "public-flows",
    source: { kind: "composite", flowId: snapshot.flowId, version: snapshot.version },
    availability: snapshot.scope.kind === "global" ? { kind: "global" } : { kind: "domain", domainId: snapshot.scope.domainId },
    capabilities: { executable: true, composite: true, asynchronous: true, retryable: true, recoverable: true },
    inputs: snapshot.interface.inputs.map((port) => ({ id: port.id, label: port.name, valueType: flowValueTypeToNodeValueType(port.valueType), ...(port.required ? { required: true } : {}) })),
    outputs: [...snapshot.interface.outputs.map((port) => ({ id: port.id, label: port.name, valueType: flowValueTypeToNodeValueType(port.valueType) })), ...snapshot.errors.map((error) => ({ id: `error.${error.id}`, label: error.id, valueType: "object" as const, role: "error" as const }))],
    parameters: []
  };
}

export function createCallFlowNode(input: { id: string; target: AutomationStudioCallFlowTarget; label?: string; position?: { x: number; y: number }; inputBindings?: AutomationStudioCallFlowBinding[]; outputBindings?: AutomationStudioCallFlowBinding[]; errorBindings?: AutomationStudioCallFlowBinding[] }): AutomationStudioFlowNode {
  const configuration: AutomationStudioCallFlowConfiguration = { target: structuredClone(input.target), ...(input.inputBindings?.length ? { inputBindings: structuredClone(input.inputBindings) } : {}), ...(input.outputBindings?.length ? { outputBindings: structuredClone(input.outputBindings) } : {}), ...(input.errorBindings?.length ? { errorBindings: structuredClone(input.errorBindings) } : {}) };
  return { id: input.id, definitionId: compositeNodeDefinitionId(input.target), definitionVersion: input.target.version, ...(input.label ? { label: input.label } : {}), ...(input.position ? { position: input.position } : {}), metadata: { [callFlowMetadataKey]: configuration } as JsonObject };
}

export function getCallFlowConfiguration(node: AutomationStudioFlowNode): AutomationStudioCallFlowConfiguration | null {
  const value = node.metadata?.[callFlowMetadataKey];
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const target = (value as Record<string, unknown>).target;
  if (!target || typeof target !== "object" || Array.isArray(target)) return null;
  const targetValue = target as Record<string, unknown>;
  const scope = targetValue.scope;
  if (typeof targetValue.flowId !== "string" || typeof targetValue.version !== "string" || !isFlowScope(scope)) return null;
  const configuration = value as Record<string, unknown>;
  return { target: { flowId: targetValue.flowId, version: targetValue.version, scope }, ...readBindings(configuration, "inputBindings"), ...readBindings(configuration, "outputBindings"), ...readBindings(configuration, "errorBindings") };
}

export function validateFlowComposition(input: { flow: AutomationStudioFlowArtifact; publishedSnapshots: AutomationStudioPublishedFlowSnapshot[]; deprecatedPublicationIds?: Iterable<string>; authorizedDomainIds?: Iterable<string>; runtimeCapabilities?: Iterable<string> }): AutomationStudioValidationResult {
  const issues: AutomationStudioValidationIssue[] = [];
  const snapshots = new Map(input.publishedSnapshots.map((snapshot) => [`${snapshot.flowId}@${snapshot.version}`, snapshot]));
  for (const [index, node] of input.flow.nodes.entries()) {
    const call = getCallFlowConfiguration(node);
    if (!call) continue;
    const path = `nodes.${index}`;
    const target = snapshots.get(`${call.target.flowId}@${call.target.version}`);
    if (!target) { issues.push({ severity: "error", code: "flow.call_target_missing", message: `Published Flow ${call.target.flowId}@${call.target.version} is unavailable.`, path }); continue; }
    if (new Set(input.deprecatedPublicationIds ?? []).has(`${call.target.flowId}@${call.target.version}`)) issues.push({ severity: "error", code: "flow.call_target_deprecated", message: `Published Flow ${call.target.flowId}@${call.target.version} is deprecated and requires a reviewed upgrade.`, path });
    if (!sameScope(target.scope, call.target.scope)) issues.push({ severity: "error", code: "flow.call_target_scope_mismatch", message: "Call Flow target scope does not match its published snapshot.", path });
    if (!compositionScopeAllows(input.flow.scope, target.scope, input.authorizedDomainIds)) issues.push({ severity: "error", code: "flow.cross_scope_call_not_authorized", message: "Call Flow scope is not authorized by the caller's explicit domain grants.", path });
    validateBindings(call.inputBindings, target.interface.inputs.map((port) => port.id), issues, `${path}.inputBindings`);
    validateBindings(call.outputBindings, target.interface.outputs.map((port) => port.id), issues, `${path}.outputBindings`);
    validateBindings(call.errorBindings, target.errors.map((error) => error.id), issues, `${path}.errorBindings`);
    const boundInputs = new Set((call.inputBindings ?? []).map((binding) => binding.targetPortId));
    for (const port of target.interface.inputs) if (port.required && port.defaultValue === undefined && !boundInputs.has(port.id)) issues.push({ severity: "error", code: "flow.call_required_input_unbound", message: `Required Call Flow input ${port.id} has no binding or default.`, path: `${path}.inputBindings` });
    if (input.runtimeCapabilities !== undefined) {
      const runtimeCapabilities = new Set(input.runtimeCapabilities);
      for (const capability of target.requiredRuntimeCapabilities ?? []) if (!runtimeCapabilities.has(capability)) issues.push({ severity: "error", code: "flow.call_runtime_capability_unavailable", message: `Published Flow ${call.target.flowId}@${call.target.version} requires unavailable runtime capability ${capability}.`, path });
    }
  }
  const cycle = findCompositeCycle(input.flow, snapshots);
  if (cycle) issues.push({ severity: "error", code: "flow.composite_cycle", message: `Composite Flow dependency cycle: ${cycle.join(" -> ")}.`, path: "nodes" });
  return { ok: issues.length === 0, issues };
}

function findCompositeCycle(root: AutomationStudioFlowArtifact, snapshots: Map<string, AutomationStudioPublishedFlowSnapshot>): string[] | null {
  const visited = new Set<string>(); const visiting = new Set<string>();
  const visit = (id: string, nodes: AutomationStudioFlowArtifact["nodes"]): string[] | null => {
    if (visiting.has(id)) return [id]; if (visited.has(id)) return null; visiting.add(id);
    for (const node of nodes) { const call = getCallFlowConfiguration(node); if (!call) continue; const targetId = `${call.target.flowId}@${call.target.version}`; const target = snapshots.get(targetId); if (!target) continue; const nested = visit(targetId, target.nodes); if (nested) return [...nested, id]; }
    visiting.delete(id); visited.add(id); return null;
  };
  return visit(`${root.flowId}@draft`, root.nodes);
}

function validateBindings(bindings: AutomationStudioCallFlowBinding[] | undefined, portIds: string[], issues: AutomationStudioValidationIssue[], path: string): void {
  const boundPorts = new Set<string>();
  for (const [index, binding] of (bindings ?? []).entries()) {
    if (!portIds.includes(binding.targetPortId)) issues.push({ severity: "error", code: "flow.call_unknown_port", message: `Call Flow binding references unknown port ${binding.targetPortId}.`, path: `${path}.${index}.targetPortId` });
    if (boundPorts.has(binding.targetPortId)) issues.push({ severity: "error", code: "flow.call_duplicate_port_binding", message: `Call Flow port ${binding.targetPortId} is bound more than once.`, path: `${path}.${index}.targetPortId` });
    boundPorts.add(binding.targetPortId);
    if (!binding.valueKey.trim()) issues.push({ severity: "error", code: "flow.call_binding_missing_value", message: "Call Flow bindings must have a value key.", path: `${path}.${index}.valueKey` });
  }
}
function readBindings(value: Record<string, unknown>, key: "inputBindings" | "outputBindings" | "errorBindings"): Partial<Pick<AutomationStudioCallFlowConfiguration, typeof key>> {
  const bindings = value[key]; if (!Array.isArray(bindings)) return {};
  const valid = bindings.filter((item): item is AutomationStudioCallFlowBinding => Boolean(item && typeof item === "object" && typeof (item as Record<string, unknown>).targetPortId === "string" && typeof (item as Record<string, unknown>).valueKey === "string"));
  return valid.length ? { [key]: valid } : {};
}
function sameScope(left: AutomationStudioFlowScope, right: AutomationStudioFlowScope): boolean { return left.kind === right.kind && (left.kind === "global" || left.domainId === (right as { domainId: string }).domainId); }
function compositionScopeAllows(caller: AutomationStudioFlowScope, target: AutomationStudioFlowScope, authorizedDomainIds: Iterable<string> | undefined): boolean {
  if (sameScope(caller, target)) return true;
  if (caller.kind === "domain" && target.kind === "global") return true;
  return caller.kind === "global" && target.kind === "domain" && new Set(authorizedDomainIds ?? []).has(target.domainId);
}
function isFlowScope(value: unknown): value is AutomationStudioFlowScope { return Boolean(value && typeof value === "object" && !Array.isArray(value) && (((value as { kind?: unknown }).kind === "global") || ((value as { kind?: unknown }).kind === "domain" && typeof (value as { domainId?: unknown }).domainId === "string"))); }
function flowValueTypeToNodeValueType(value: AutomationStudioFlowArtifact["interface"]["inputs"][number]["valueType"]): "string" | "number" | "boolean" | "object" | "array" | "any" { if (value.kind === "string") return "string"; if (value.kind === "number") return "number"; if (value.kind === "boolean") return "boolean"; if (value.kind === "array") return "array"; if (value.kind === "record" || value.kind === "schema" || value.kind === "json") return "object"; return "any"; }
function digestFlowPublication(value: unknown): string { return `sha256:${createHash("sha256").update(stableStringify(value)).digest("hex")}`; }
function stableStringify(value: unknown): string { if (value === null || typeof value !== "object") return JSON.stringify(value); if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`; const record = value as Record<string, unknown>; return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(",")}}`; }
