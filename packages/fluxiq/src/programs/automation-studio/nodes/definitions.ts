import type { JsonObject } from "../../../core/index.ts";
import type { AutomationStudioFlowScope } from "../model/flows.ts";
import type { AutomationStudioValidationIssue, AutomationStudioValidationResult } from "../model/validation.ts";
import type {
  AutomationNodeClass,
  AutomationNodeDefinition,
  AutomationNodeParameter,
  AutomationNodePort
} from "./contracts.ts";

export type AutomationStudioNodeAvailability =
  | { kind: "global" }
  | { kind: "domain"; domainId: string }
  | { kind: "both" };

export type AutomationStudioNodeSource =
  | { kind: "builtin"; implementationKey: string }
  | { kind: "importer"; domainId: string; implementationKey: string; packageId?: string }
  | { kind: "code"; moduleId: string; exportName?: string; implementationKey: string; trust: "trusted-local" }
  | { kind: "composite"; flowId: string; version: string }
  | { kind: "recording"; proposalId: string; mapperId?: string };

export type AutomationStudioNodeCapabilities = {
  executable?: true;
  trigger?: true;
  stateAware?: true;
  recordable?: true;
  retryable?: true;
  recoverable?: true;
  asynchronous?: true;
  composite?: true;
  codeBacked?: true;
};

export type AutomationStudioNodeSafety = {
  privileged?: boolean;
  requiresOperatorApproval?: boolean;
  requiredPermissions?: string[];
  runtime?: AutomationStudioNodeRuntimeRequirements;
};

export type AutomationStudioNodeRuntimeRequirements = {
  networkDestinations?: string[];
  secretHandles?: string[];
  filesystemRoots?: string[];
  process?: boolean;
  childProcess?: boolean;
};

export type AutomationStudioNodeOutputActionContract = {
  fixedOutputId?: string;
  allowedOutputIds?: string[];
};

export type AutomationStudioNodeEditorHints = {
  color?: string;
  documentationUrl?: string;
  parameterGroups?: Array<{ id: string; label: string; parameterIds: string[] }>;
};

/**
 * Canonical node contract used by new Flow authoring surfaces.
 *
 * Existing AutomationNodeDefinition remains the executable built-in contract
 * until the runtime adopts this registry in a later slice.
 */
export type AutomationStudioNodeDefinition = {
  schemaVersion: "0.1";
  id: string;
  version: string;
  label: string;
  description: string;
  category: string;
  source: AutomationStudioNodeSource;
  availability: AutomationStudioNodeAvailability;
  capabilities: AutomationStudioNodeCapabilities;
  requiredRuntimeCapabilities?: string[];
  safety?: AutomationStudioNodeSafety;
  outputAction?: AutomationStudioNodeOutputActionContract;
  inputs: AutomationNodePort[];
  outputs: AutomationNodePort[];
  parameters: AutomationNodeParameter[];
  icon?: string;
  tags?: string[];
  legacyScope?: "policy" | "routine" | "both";
  metadata?: JsonObject;
  editor?: AutomationStudioNodeEditorHints;
};

/** Plain registration boundary importers can expose from their configured source root. */
export type AutomationStudioImporterNodeManifest = {
  schemaVersion: "0.1";
  domainId: string;
  nodes: AutomationStudioNodeDefinition[];
};

export type AutomationStudioNodeRegistryResolution = {
  scope: AutomationStudioFlowScope;
  runtimeCapabilities?: Iterable<string>;
  permissions?: Iterable<string>;
};

export function adaptBuiltinAutomationNodeDefinition(definition: AutomationNodeDefinition): AutomationStudioNodeDefinition {
  return {
    schemaVersion: "0.1",
    id: definition.id,
    version: "1.0.0",
    label: definition.label,
    description: definition.description,
    category: definition.class === "routine" ? "flow" : definition.class,
    source: { kind: "builtin", implementationKey: definition.implementationKey },
    availability: { kind: "both" },
    capabilities: builtinCapabilities(definition),
    ...(definition.privileged ? { safety: { privileged: true } } : {}),
    inputs: definition.inputs,
    outputs: definition.outputs,
    parameters: definition.parameters,
    ...(definition.icon !== undefined ? { icon: definition.icon } : {}),
    ...(definition.tags !== undefined ? { tags: definition.tags } : {}),
    legacyScope: definition.scope
  };
}

export function validateAutomationStudioNodeDefinition(definition: AutomationStudioNodeDefinition): AutomationStudioValidationResult {
  const issues: AutomationStudioValidationIssue[] = [];
  if (!definition.id.trim()) issue(issues, "node.missing_id", "Node definition must have an id.", "id");
  if (!isSemanticVersion(definition.version)) issue(issues, "node.invalid_version", "Node definition version must use major.minor.patch semantic versioning.", "version");
  if (!definition.label.trim()) issue(issues, "node.missing_label", "Node definition must have a label.", "label");
  if (!definition.description.trim()) issue(issues, "node.missing_description", "Node definition must have a description.", "description");
  if (!definition.category.trim()) issue(issues, "node.missing_category", "Node definition must have a category.", "category");
  validateSource(definition, issues);
  validateAvailability(definition, issues);
  validatePorts(definition.inputs, issues, "inputs");
  validatePorts(definition.outputs, issues, "outputs");
  validateParameters(definition.parameters, issues);
  if (definition.safety?.requiredPermissions?.some((permission) => !permission.trim())) {
    issue(issues, "node.invalid_required_permission", "Node requiredPermissions cannot contain empty values.", "safety.requiredPermissions");
  }
  if (definition.requiredRuntimeCapabilities?.some((capability) => !capability.trim())) {
    issue(issues, "node.invalid_runtime_capability", "Node requiredRuntimeCapabilities cannot contain empty values.", "requiredRuntimeCapabilities");
  }
  validateRuntimeRequirements(definition.safety?.runtime, issues);
  if (definition.source.kind === "code" && definition.source.trust !== "trusted-local") issue(issues, "node.code_untrusted_not_supported", "Code Nodes currently support trusted-local implementations only.", "source.trust");
  if (definition.source.kind === "code" && definition.outputAction) issue(issues, "node.code_output_action_forbidden", "Code Nodes cannot declare importer output actions.", "outputAction");
  if (definition.outputAction && definition.source.kind !== "importer" && definition.source.kind !== "recording") issue(issues, "node.output_action_requires_importer", "Output action contracts are only valid for importer or reviewed recording-derived nodes.", "outputAction");
  return { ok: issues.length === 0, issues };
}

export function validateAutomationStudioImporterNodeManifest(manifest: AutomationStudioImporterNodeManifest): AutomationStudioValidationResult {
  const issues: AutomationStudioValidationIssue[] = [];
  const ids = new Set<string>();
  if (!manifest.domainId.trim()) issue(issues, "node_manifest.missing_domain_id", "Importer node manifest must have a domainId.", "domainId");
  for (const [index, node] of manifest.nodes.entries()) {
    if (ids.has(node.id)) issue(issues, "node_manifest.duplicate_node_id", `Duplicate importer node id "${node.id}".`, `nodes.${index}.id`);
    ids.add(node.id);
    if (node.source.kind !== "importer") {
      issue(issues, "node_manifest.invalid_source", "Importer manifests may only register importer node definitions.", `nodes.${index}.source.kind`);
    } else if (node.source.domainId !== manifest.domainId) {
      issue(issues, "node_manifest.domain_mismatch", "Importer node source domainId must match its manifest domainId.", `nodes.${index}.source.domainId`);
    }
    for (const nodeIssue of validateAutomationStudioNodeDefinition(node).issues) {
      issues.push({ ...nodeIssue, path: `nodes.${index}.${nodeIssue.path}` });
    }
  }
  return { ok: issues.length === 0, issues };
}

function builtinCapabilities(definition: AutomationNodeDefinition): AutomationStudioNodeCapabilities {
  return {
    executable: true,
    ...(definition.class === "policy" ? { stateAware: true, recoverable: true } : {}),
    ...(definition.class === "timing" ? { asynchronous: true, retryable: true } : {}),
    ...(definition.class === "routine" ? { composite: true } : {})
  };
}

function validateSource(definition: AutomationStudioNodeDefinition, issues: AutomationStudioValidationIssue[]): void {
  const source = definition.source;
  if (source.kind === "builtin" && !source.implementationKey.trim()) issue(issues, "node.missing_implementation_key", "Built-in node must have an implementationKey.", "source.implementationKey");
  if (source.kind === "importer") {
    if (!source.domainId.trim()) issue(issues, "node.missing_importer_domain", "Importer node must have a domainId.", "source.domainId");
    if (!source.implementationKey.trim()) issue(issues, "node.missing_implementation_key", "Importer node must have an implementationKey.", "source.implementationKey");
    if (definition.availability.kind !== "domain" || definition.availability.domainId !== source.domainId) {
      issue(issues, "node.importer_scope_mismatch", "Importer node availability must be its source domain.", "availability");
    }
  }
  if (source.kind === "composite" && (!source.flowId.trim() || !isSemanticVersion(source.version))) {
    issue(issues, "node.invalid_composite_source", "Composite node must reference a Flow id and semantic version.", "source");
  }
  if (source.kind === "recording" && !source.proposalId.trim()) issue(issues, "node.missing_recording_proposal", "Recording-derived node must have a proposalId.", "source.proposalId");
  if (source.kind === "code") {
    if (!source.moduleId.trim()) issue(issues, "node.code_missing_module", "Code Node must declare a moduleId.", "source.moduleId");
    if (!source.implementationKey.trim()) issue(issues, "node.missing_implementation_key", "Code Node must declare an implementationKey.", "source.implementationKey");
  }
}

function validateAvailability(definition: AutomationStudioNodeDefinition, issues: AutomationStudioValidationIssue[]): void {
  if (definition.availability.kind === "domain" && !definition.availability.domainId.trim()) {
    issue(issues, "node.missing_availability_domain", "Domain node availability must have a domainId.", "availability.domainId");
  }
}

function validateRuntimeRequirements(value: AutomationStudioNodeRuntimeRequirements | undefined, issues: AutomationStudioValidationIssue[]): void {
  if (!value) return;
  for (const [key, items] of [["networkDestinations", value.networkDestinations], ["secretHandles", value.secretHandles], ["filesystemRoots", value.filesystemRoots]] as const) if (items?.some((item) => !item.trim())) issue(issues, "node.invalid_runtime_requirement", `${key} cannot contain empty values.`, `safety.runtime.${key}`);
}

function validatePorts(ports: AutomationNodePort[], issues: AutomationStudioValidationIssue[], path: string): void {
  const ids = new Set<string>();
  for (const [index, port] of ports.entries()) {
    if (!port.id.trim()) issue(issues, "node.port_missing_id", "Node port must have an id.", `${path}.${index}.id`);
    if (!port.label.trim()) issue(issues, "node.port_missing_label", "Node port must have a label.", `${path}.${index}.label`);
    if (ids.has(port.id)) issue(issues, "node.duplicate_port_id", `Duplicate node port id "${port.id}".`, `${path}.${index}.id`);
    ids.add(port.id);
  }
}

function validateParameters(parameters: AutomationNodeParameter[], issues: AutomationStudioValidationIssue[]): void {
  const ids = new Set<string>();
  for (const [index, parameter] of parameters.entries()) {
    if (!parameter.id.trim()) issue(issues, "node.parameter_missing_id", "Node parameter must have an id.", `parameters.${index}.id`);
    if (!parameter.label.trim()) issue(issues, "node.parameter_missing_label", "Node parameter must have a label.", `parameters.${index}.label`);
    if (ids.has(parameter.id)) issue(issues, "node.duplicate_parameter_id", `Duplicate node parameter id "${parameter.id}".`, `parameters.${index}.id`);
    ids.add(parameter.id);
  }
}

function issue(issues: AutomationStudioValidationIssue[], code: string, message: string, path: string): void {
  issues.push({ severity: "error", code, message, path });
}

function isSemanticVersion(value: string): boolean {
  return /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/.test(value);
}
