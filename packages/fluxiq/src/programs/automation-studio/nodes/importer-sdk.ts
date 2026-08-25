import type { JsonObject, JsonValue } from "../../../core/index.ts";
import type { AutomationStudioElementMatcher } from "../fingerprinting/index.ts";
import type { AutomationNodeExecutionResult } from "./contracts.ts";
import { AutomationStudioNodeRegistry } from "./canonical-registry.ts";
import { validateAutomationStudioNodeDefinition, type AutomationStudioNodeDefinition } from "./definitions.ts";

export const AUTOMATION_STUDIO_IMPORTER_SDK_VERSION = "0.1" as const;
export type AutomationStudioImporterSchema = { id: string; version: string; valueType: JsonObject };
export type AutomationStudioRecordingMapperDefinition = { id: string; version: string; description: string; outputIds?: string[] };
export type AutomationStudioRecordingMapperObservation = {
  observationId: string;
  recordingId: string;
  domainId: string | null;
  type: string;
  timestamp: number;
  payload: JsonObject;
  metadata: JsonObject;
};
export type AutomationStudioRecordingMapperCandidate = {
  outputId: string;
  parameters?: JsonObject;
  sourceObservationIds?: string[];
  sourceInputIds?: string[];
  expectedConfirmation?: { inputId: string; timeoutMs?: number; description?: string };
  confidence?: number;
  evidence?: Array<{ layer: "recording" | "normalized_timeline" | "evidence"; artifactId: string; entryId?: string; observationId?: string }>;
  label?: string;
  description?: string;
};
export type AutomationStudioRecordingMapperResult = AutomationStudioRecordingMapperCandidate | { candidates: AutomationStudioRecordingMapperCandidate[] } | null;
export type AutomationStudioTargetResolverDefinition = { id: string; version: string; description: string };
export type AutomationStudioComparatorDefinition = { id: string; version: string; description: string; valueTypes: string[] };
export type AutomationStudioStateVisualizerDefinition = {
  id: string;
  version: string;
  label: string;
  description?: string;
  supportedNamespaces?: string[];
  supportedKinds?: string[];
  supportedRendererIds?: string[];
  metadata?: JsonObject;
};

export type AutomationStudioImporterSdkManifest = {
  schemaVersion: "0.1";
  sdkVersion: typeof AUTOMATION_STUDIO_IMPORTER_SDK_VERSION;
  packageId: string;
  packageVersion: string;
  domainId: string;
  nodes: AutomationStudioNodeDefinition[];
  recordingMappers?: AutomationStudioRecordingMapperDefinition[];
  targetResolvers?: AutomationStudioTargetResolverDefinition[];
  comparators?: AutomationStudioComparatorDefinition[];
  stateVisualizers?: AutomationStudioStateVisualizerDefinition[];
  schemas?: AutomationStudioImporterSchema[];
  editor?: { displayName?: string; icon?: string; categories?: Array<{ id: string; label: string }> };
  metadata?: JsonObject;
};

export type AutomationStudioNativeLogEntry = { level: "debug" | "info" | "warning" | "error"; message: string; data?: JsonObject };
export type AutomationStudioNativeNodeContext = {
  inputs: Readonly<Record<string, JsonValue>>;
  parameters: Readonly<Record<string, JsonValue>>;
  signal: AbortSignal;
  grants: Readonly<{ permissions: string[]; runtimeCapabilities: string[]; networkDestinations: string[]; secretHandles: string[]; filesystemRoots: string[]; process: boolean; childProcess: boolean }>;
  host?: Readonly<{
    capabilityIds: string[];
    currentStateRef?: JsonObject;
    previousStateRef?: JsonObject;
    sideEffectClass: "none" | "internal" | "external" | "destructive";
    target?: JsonValue;
  }>;
  elementMatcher: AutomationStudioElementMatcher;
  resolveTarget(resolverId: string, target: JsonObject): Promise<JsonObject | null>;
  log(entry: AutomationStudioNativeLogEntry): void;
};
export type AutomationStudioNativeNodeImplementation = (context: AutomationStudioNativeNodeContext) => AutomationNodeExecutionResult | Promise<AutomationNodeExecutionResult>;
export type AutomationStudioRecordingMapperImplementation = (observation: AutomationStudioRecordingMapperObservation, context: { signal: AbortSignal; elementMatcher: AutomationStudioElementMatcher }) => AutomationStudioRecordingMapperResult | Promise<AutomationStudioRecordingMapperResult>;
export type AutomationStudioTargetResolverImplementation = (target: JsonObject, context: { signal: AbortSignal; elementMatcher: AutomationStudioElementMatcher }) => JsonObject | null | Promise<JsonObject | null>;
export type AutomationStudioComparatorImplementation = (left: JsonValue, right: JsonValue) => { equal: boolean; score?: number };

export type AutomationStudioImporterImplementationBundle = {
  packageId: string;
  packageVersion: string;
  implementations: Record<string, AutomationStudioNativeNodeImplementation>;
  recordingMappers?: Record<string, AutomationStudioRecordingMapperImplementation>;
  targetResolvers?: Record<string, AutomationStudioTargetResolverImplementation>;
  comparators?: Record<string, AutomationStudioComparatorImplementation>;
};

/** Explicit manifest registry. FluxIQ never scans or imports host modules from display metadata. */
export class AutomationStudioImporterSdkRegistry {
  private readonly manifests = new Map<string, AutomationStudioImporterSdkManifest>();
  readonly nodes = new AutomationStudioNodeRegistry();

  register(manifest: AutomationStudioImporterSdkManifest): this {
    const issues = validateAutomationStudioImporterSdkManifest(manifest);
    if (issues.length) throw new Error(`Invalid Automation Studio importer SDK manifest: ${issues.join(", ")}`);
    const existing = this.manifests.get(manifest.packageId);
    if (existing && existing.domainId !== manifest.domainId) throw new Error(`Importer package ${manifest.packageId} cannot change domains.`);
    if (existing) throw new Error(`Importer package ${manifest.packageId} is already registered; create a new host runtime to activate version ${manifest.packageVersion}.`);
    for (const node of manifest.nodes) this.nodes.register(node);
    this.manifests.set(manifest.packageId, structuredClone(manifest));
    return this;
  }
  get(packageId: string): AutomationStudioImporterSdkManifest | undefined { const value = this.manifests.get(packageId); return value ? structuredClone(value) : undefined; }
  list(): AutomationStudioImporterSdkManifest[] { return [...this.manifests.values()].map((value) => structuredClone(value)); }
}

export function validateAutomationStudioImporterSdkManifest(manifest: AutomationStudioImporterSdkManifest): string[] {
  const issues: string[] = [];
  if (manifest.sdkVersion !== AUTOMATION_STUDIO_IMPORTER_SDK_VERSION) issues.push("importer_sdk.version_mismatch");
  if (!manifest.packageId.trim() || !manifest.packageVersion.trim() || !manifest.domainId.trim()) issues.push("importer_sdk.missing_identity");
  if (!isSemanticVersion(manifest.packageVersion)) issues.push("importer_sdk.invalid_package_version");
  const ids = new Set<string>();
  for (const node of manifest.nodes) {
    if (ids.has(node.id)) issues.push("importer_sdk.duplicate_node"); ids.add(node.id);
    const validation = validateAutomationStudioNodeDefinition(node); if (!validation.ok) issues.push(...validation.issues.map((item) => item.code));
    if (node.source.kind !== "importer" && node.source.kind !== "code") issues.push("importer_sdk.invalid_node_source");
    if (node.source.kind === "importer" && (node.source.domainId !== manifest.domainId || node.source.packageId !== manifest.packageId)) issues.push("importer_sdk.node_identity_mismatch");
    if (node.source.kind === "code" && (node.availability.kind !== "domain" || node.availability.domainId !== manifest.domainId)) issues.push("importer_sdk.code_scope_mismatch");
  }
  for (const collection of [manifest.recordingMappers ?? [], manifest.targetResolvers ?? [], manifest.comparators ?? [], manifest.schemas ?? []]) { const seen = new Set<string>(); for (const item of collection) { if (!item.id.trim()) issues.push("importer_sdk.missing_extension_id"); if (!isSemanticVersion(item.version)) issues.push("importer_sdk.invalid_extension_version"); if (seen.has(item.id)) issues.push("importer_sdk.duplicate_extension_id"); seen.add(item.id); } }
  for (const mapper of manifest.recordingMappers ?? []) { if (!mapper.description.trim()) issues.push("importer_sdk.missing_extension_description"); if (mapper.outputIds?.some((id) => !id.trim()) || new Set(mapper.outputIds ?? []).size !== (mapper.outputIds ?? []).length) issues.push("importer_sdk.invalid_mapper_output_ids"); }
  for (const resolver of manifest.targetResolvers ?? []) if (!resolver.description.trim()) issues.push("importer_sdk.missing_extension_description");
  for (const comparator of manifest.comparators ?? []) { if (!comparator.description.trim()) issues.push("importer_sdk.missing_extension_description"); if (!comparator.valueTypes.length || comparator.valueTypes.some((value) => !value.trim())) issues.push("importer_sdk.invalid_comparator_types"); }
  validateStateVisualizers(manifest, issues);
  return [...new Set(issues)];
}

function isSemanticVersion(value: string): boolean { return /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/.test(value); }

function validateStateVisualizers(manifest: AutomationStudioImporterSdkManifest, issues: string[]): void {
  const seen = new Set<string>();
  for (const visualizer of manifest.stateVisualizers ?? []) {
    if (!visualizer.id.trim()) issues.push("importer_sdk.missing_state_visualizer_id");
    if (seen.has(visualizer.id)) issues.push("importer_sdk.duplicate_state_visualizer_id");
    seen.add(visualizer.id);
    if (!isSemanticVersion(visualizer.version)) issues.push("importer_sdk.invalid_state_visualizer_version");
    if (!visualizer.label.trim()) issues.push("importer_sdk.missing_state_visualizer_label");
    if (visualizer.supportedNamespaces?.some((value) => !value.trim()) || hasDuplicates(visualizer.supportedNamespaces)) issues.push("importer_sdk.invalid_state_visualizer_namespaces");
    if (visualizer.supportedKinds?.some((value) => !value.trim()) || hasDuplicates(visualizer.supportedKinds)) issues.push("importer_sdk.invalid_state_visualizer_kinds");
    if (visualizer.supportedRendererIds?.some((value) => !value.trim()) || hasDuplicates(visualizer.supportedRendererIds)) issues.push("importer_sdk.invalid_state_visualizer_renderer_ids");
    const metadata = visualizer.metadata ?? {};
    if (typeof metadata.domainId === "string" && metadata.domainId !== manifest.domainId) issues.push("importer_sdk.state_visualizer_identity_mismatch");
    if (typeof metadata.packageId === "string" && metadata.packageId !== manifest.packageId) issues.push("importer_sdk.state_visualizer_identity_mismatch");
    if (claimsExecutableCapability(metadata)) issues.push("importer_sdk.state_visualizer_claims_capability");
  }
}

function hasDuplicates(values: string[] | undefined): boolean {
  return Boolean(values && new Set(values).size !== values.length);
}

function claimsExecutableCapability(metadata: JsonObject): boolean {
  const blocked = new Set(["implementationKey", "runtimeCapabilities", "permissions", "grants", "storageAccess", "filesystemRoots", "networkDestinations", "execute", "module", "import"]);
  return Object.keys(metadata).some((key) => blocked.has(key));
}
