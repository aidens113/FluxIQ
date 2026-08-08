import { createHash } from "node:crypto";
import { getCallFlowConfiguration, validateAutomationStudioFlow, type AutomationStudioFlowArtifact } from "../model/index.ts";
import { AutomationStudioNodeRegistry, type AutomationStudioNodeDefinition } from "../nodes/index.ts";
import { compileAutomationStudioRegions } from "../runtime/region-compiler.ts";
import type { AutomationStudioFlowCompilation, AutomationStudioFlowCompilerDiagnostic, AutomationStudioFlowDefinition, AutomationStudioFlowDependency } from "./contracts.ts";

const compilerVersion = "0.1" as const;

/** Marks a JSON-compatible declarative Flow definition. No user code is executed. */
export function defineFlow(definition: AutomationStudioFlowDefinition): AutomationStudioFlowDefinition {
  return structuredClone(definition);
}

export function compileFlowDefinition(definition: AutomationStudioFlowDefinition, options: { projectId: string; now?: number; moduleId?: string; sourceDigest?: string; registry?: AutomationStudioNodeRegistry } ): AutomationStudioFlowCompilation {
  const now = options.now ?? Date.now();
  const dependencies = normalizeDependencies(definition.dependencies ?? []);
  const base: AutomationStudioFlowArtifact = {
    schemaVersion: "0.1", flowId: definition.flowId, projectId: options.projectId, name: definition.name,
    ...(definition.description !== undefined ? { description: definition.description } : {}), scope: definition.scope ?? { kind: "global" },
    visibility: definition.visibility ?? "private", origin: definition.origin ?? "manual",
    source: options.moduleId ? { mode: "code", moduleId: options.moduleId, sourceDigest: options.sourceDigest ?? "", compilerVersion, compiledDigest: "pending", declaredDependencies: dependencies.map((item) => `${item.kind}:${item.id}@${item.version}`) } : { mode: "visual" },
    interface: definition.interface ?? { inputs: [], outputs: [] }, errors: definition.errors ?? [], variables: definition.variables ?? [],
    nodes: definition.nodes ?? [], edges: definition.edges ?? [], ...(definition.regions ? { regions: definition.regions } : {}), ...(definition.regionHandoffs ? { regionHandoffs: definition.regionHandoffs } : {}),
    ...(definition.executionDefaults ? { executionDefaults: definition.executionDefaults } : {}), publication: { status: "draft" }, createdAt: now, updatedAt: now
  };
  const flow = normalizeAutomationStudioFlow(base);
  const diagnostics: AutomationStudioFlowCompilerDiagnostic[] = validateAutomationStudioFlow(flow).issues.map((issue) => ({ severity: issue.severity, code: issue.code, message: issue.message, ...(issue.path ? { path: issue.path } : {}), remediation: "Correct the declarative Flow field identified by path." }));
  validateRegistry(flow, options.registry ?? new AutomationStudioNodeRegistry(), diagnostics);
  validateDependencies(flow, dependencies, options.registry ?? new AutomationStudioNodeRegistry(), diagnostics);
  const regions = compileAutomationStudioRegions(flow);
  if (!regions.ok) for (const issue of regions.issues) if (!diagnostics.some((item) => item.code === issue.code && item.path === issue.path)) diagnostics.push({ severity: "error", code: issue.code, message: issue.message, ...(issue.path ? { path: issue.path } : {}), remediation: "Declare node ownership and a typed handoff for every cross-region edge." });
  if (diagnostics.some((item) => item.severity === "error")) return { ok: false, diagnostics };
  const digest = digestFlow(flow, dependencies);
  if (flow.source.mode === "code") flow.source.compiledDigest = digest;
  return { ok: true, diagnostics, plan: { schemaVersion: "0.1", compilerVersion, digest, flow, nodeRegionIds: regions.ok ? regions.plan.nodeRegionIds : {}, dependencyPins: dependencies } };
}

export function normalizeAutomationStudioFlow(flow: AutomationStudioFlowArtifact): AutomationStudioFlowArtifact {
  const normalized = structuredClone(flow);
  normalized.nodes.sort((a, b) => a.id.localeCompare(b.id)); normalized.edges.sort((a, b) => a.id.localeCompare(b.id));
  normalized.interface.inputs.sort((a, b) => a.id.localeCompare(b.id)); normalized.interface.outputs.sort((a, b) => a.id.localeCompare(b.id));
  normalized.errors.sort((a, b) => a.id.localeCompare(b.id)); normalized.variables.sort((a, b) => a.id.localeCompare(b.id));
  normalized.regions?.sort((a, b) => a.id.localeCompare(b.id)); normalized.regionHandoffs?.sort((a, b) => a.id.localeCompare(b.id));
  for (const node of normalized.nodes) if (node.position) node.position = { x: Math.round(node.position.x * 1000) / 1000, y: Math.round(node.position.y * 1000) / 1000 };
  for (const region of normalized.regions ?? []) { region.nodeIds.sort(); region.entryPorts.sort((a, b) => a.id.localeCompare(b.id)); region.exitPorts.sort((a, b) => a.id.localeCompare(b.id)); region.requiredRuntimeCapabilities?.sort(); }
  normalized.executionDefaults?.authorizedDomainIds?.sort();
  return normalized;
}

/** Detects graph edits that were not produced by the code compiler. */
export function verifyCodeOwnedFlowCompilation(flow: AutomationStudioFlowArtifact): boolean {
  if (flow.source.mode !== "code") return true;
  const dependencies = (flow.source.declaredDependencies ?? []).flatMap((pin): AutomationStudioFlowDependency[] => {
    const match = /^(flow|node|schema):(.+)@([^@]+)$/.exec(pin); return match ? [{ kind: match[1] as AutomationStudioFlowDependency["kind"], id: match[2]!, version: match[3]! }] : [];
  });
  return Boolean(flow.source.compiledDigest) && digestFlow(normalizeAutomationStudioFlow(flow), normalizeDependencies(dependencies)) === flow.source.compiledDigest;
}

function validateRegistry(flow: AutomationStudioFlowArtifact, registry: AutomationStudioNodeRegistry, diagnostics: AutomationStudioFlowCompilerDiagnostic[]): void {
  for (const [index, node] of flow.nodes.entries()) {
    const definition = registry.get(node.definitionId);
    if (!definition && getCallFlowConfiguration(node)) continue;
    if (!definition) { diagnostics.push({ severity: "error", code: "flow.node_definition_unavailable", message: `Node definition ${node.definitionId} is not registered for this Flow scope.`, path: `nodes.${index}.definitionId`, remediation: "Register the node manifest in the importing runtime or choose a node available in this scope." }); continue; }
    if (node.definitionVersion && node.definitionVersion !== definition.version) { diagnostics.push({ severity: "error", code: "flow.node_definition_version_mismatch", message: `Node ${node.definitionId} pins ${node.definitionVersion}, but the registry provides ${definition.version}.`, path: `nodes.${index}.definitionVersion`, remediation: "Install the pinned node definition or explicitly review and save an upgrade." }); continue; }
    if (!definitionScopeAllows(definition.availability, flow.scope)) { diagnostics.push({ severity: "error", code: "flow.node_definition_wrong_scope", message: `Node definition ${node.definitionId} is not available in this Flow scope.`, path: `nodes.${index}.definitionId`, remediation: "Use the node only inside its declared global/domain scope." }); continue; }
    for (const edge of flow.edges.filter((item) => item.sourceNodeId === node.id)) if (edge.sourcePortId && !["success", "failed"].includes(edge.sourcePortId) && !definition.outputs.some((port) => port.id === edge.sourcePortId)) diagnostics.push({ severity: "error", code: "flow.edge_unknown_source_port", message: `Node ${node.id} has no output port ${edge.sourcePortId}.`, path: `edges.${flow.edges.indexOf(edge)}.sourcePortId`, remediation: "Use an output port declared by the pinned node definition." });
    for (const edge of flow.edges.filter((item) => item.targetNodeId === node.id)) if (edge.targetPortId && edge.targetPortId !== "in" && !definition.inputs.some((port) => port.id === edge.targetPortId)) diagnostics.push({ severity: "error", code: "flow.edge_unknown_target_port", message: `Node ${node.id} has no input port ${edge.targetPortId}.`, path: `edges.${flow.edges.indexOf(edge)}.targetPortId`, remediation: "Use an input port declared by the pinned node definition." });
  }
}
function definitionScopeAllows(availability: AutomationStudioNodeDefinition["availability"], scope: AutomationStudioFlowArtifact["scope"]): boolean { return availability.kind === "both" || (availability.kind === "global" && scope.kind === "global") || (availability.kind === "domain" && scope.kind === "domain" && availability.domainId === scope.domainId); }

function validateDependencies(flow: AutomationStudioFlowArtifact, dependencies: AutomationStudioFlowDependency[], registry: AutomationStudioNodeRegistry, diagnostics: AutomationStudioFlowCompilerDiagnostic[]): void {
  const pins = new Set(dependencies.map((item) => `${item.kind}:${item.id}@${item.version}`));
  for (const [index, node] of flow.nodes.entries()) {
    const call = getCallFlowConfiguration(node);
    if (call && !pins.has(`flow:${call.target.flowId}@${call.target.version}`)) diagnostics.push({ severity: "error", code: "flow.call_dependency_undeclared", message: `Call Flow dependency ${call.target.flowId}@${call.target.version} is not declared.`, path: `nodes.${index}`, remediation: "Add the exact published Flow version to dependencies." });
    if (call || node.definitionId.startsWith("builtin.")) continue;
    const definition = registry.get(node.definitionId);
    const version = node.definitionVersion ?? definition?.version;
    if (version && !pins.has(`node:${node.definitionId}@${version}`)) diagnostics.push({ severity: "error", code: "flow.node_dependency_undeclared", message: `Node dependency ${node.definitionId}@${version} is not declared.`, path: `nodes.${index}`, remediation: "Add the exact node-definition version to dependencies." });
  }
  const schemaTypes = [...flow.interface.inputs, ...flow.interface.outputs, ...flow.variables, ...(flow.regions ?? []).flatMap((region) => [...region.entryPorts, ...region.exitPorts])].flatMap((item) => collectSchemaTypes(item.valueType));
  for (const schema of schemaTypes) {
    if (!schema.version) diagnostics.push({ severity: "error", code: "flow.schema_dependency_unversioned", message: `Schema dependency ${schema.id} has no version.`, path: "interface", remediation: "Pin a schemaVersion and declare the matching schema dependency." });
    else if (!pins.has(`schema:${schema.id}@${schema.version}`)) diagnostics.push({ severity: "error", code: "flow.schema_dependency_undeclared", message: `Schema dependency ${schema.id}@${schema.version} is not declared.`, path: "interface", remediation: "Add the exact schema version to dependencies." });
  }
}

function collectSchemaTypes(valueType: AutomationStudioFlowArtifact["interface"]["inputs"][number]["valueType"]): Array<{ id: string; version?: string }> {
  if (valueType.kind === "schema") return [{ id: valueType.schemaId, ...(valueType.schemaVersion ? { version: valueType.schemaVersion } : {}) }];
  if (valueType.kind === "array") return collectSchemaTypes(valueType.item);
  if (valueType.kind === "record") return Object.values(valueType.properties ?? {}).flatMap(collectSchemaTypes);
  return [];
}

function normalizeDependencies(items: AutomationStudioFlowDependency[]): AutomationStudioFlowDependency[] { return [...items].map((item) => ({ ...item })).sort((a, b) => `${a.kind}:${a.id}@${a.version}`.localeCompare(`${b.kind}:${b.id}@${b.version}`)); }
function digestFlow(flow: AutomationStudioFlowArtifact, dependencies: AutomationStudioFlowDependency[]): string { const value = { ...flow, createdAt: 0, updatedAt: 0, source: flow.source.mode === "code" ? { ...flow.source, compiledDigest: "" } : flow.source, dependencies }; return `sha256:${createHash("sha256").update(stableStringify(value)).digest("hex")}`; }
function stableStringify(value: unknown): string { if (value === null || typeof value !== "object") return JSON.stringify(value); if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`; const record = value as Record<string, unknown>; return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(",")}}`; }
