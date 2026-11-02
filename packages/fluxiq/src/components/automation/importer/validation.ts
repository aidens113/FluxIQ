import type { JsonObject } from "../../../core/index.ts";
import { validateAutomationStudioNodeDefinition } from "../definitions.ts";
import { AUTOMATION_STUDIO_IMPORTER_SDK_VERSION } from "./version.ts";
import type { AutomationStudioImporterSdkManifest } from "./manifest.ts";
export function validateAutomationStudioImporterSdkManifest(manifest: AutomationStudioImporterSdkManifest): string[] {
  const issues: string[] = [];
  if (manifest.sdkVersion !== AUTOMATION_STUDIO_IMPORTER_SDK_VERSION)
    issues.push("importer_sdk.version_mismatch");
  if (!manifest.packageId.trim() || !manifest.packageVersion.trim() || !manifest.domainId.trim())
    issues.push("importer_sdk.missing_identity");
  if (!isSemanticVersion(manifest.packageVersion))
    issues.push("importer_sdk.invalid_package_version");
  const ids = new Set<string>();
  for (const node of manifest.nodes) {
    if (ids.has(node.id))
      issues.push("importer_sdk.duplicate_node");
    ids.add(node.id);
    const validation = validateAutomationStudioNodeDefinition(node);
    if (!validation.ok)
      issues.push(...validation.issues.map((item) => item.code));
    if (node.source.kind !== "importer" && node.source.kind !== "code")
      issues.push("importer_sdk.invalid_node_source");
    if (node.source.kind === "importer" && (node.source.domainId !== manifest.domainId || node.source.packageId !== manifest.packageId))
      issues.push("importer_sdk.node_identity_mismatch");
    if (node.source.kind === "code" && (node.availability.kind !== "domain" || node.availability.domainId !== manifest.domainId))
      issues.push("importer_sdk.code_scope_mismatch");
  }
  for (const collection of [manifest.recordingMappers ?? [], manifest.targetResolvers ?? [], manifest.comparators ?? [], manifest.schemas ?? []]) {
    const seen = new Set<string>();
    for (const item of collection) {
      if (!item.id.trim())
        issues.push("importer_sdk.missing_extension_id");
      if (!isSemanticVersion(item.version))
        issues.push("importer_sdk.invalid_extension_version");
      if (seen.has(item.id))
        issues.push("importer_sdk.duplicate_extension_id");
      seen.add(item.id);
    }
  }
  for (const mapper of manifest.recordingMappers ?? []) {
    if (!mapper.description.trim())
      issues.push("importer_sdk.missing_extension_description");
    if (mapper.outputIds?.some((id) => !id.trim()) || new Set(mapper.outputIds ?? []).size !== (mapper.outputIds ?? []).length)
      issues.push("importer_sdk.invalid_mapper_output_ids");
  }
  for (const resolver of manifest.targetResolvers ?? [])
    if (!resolver.description.trim())
      issues.push("importer_sdk.missing_extension_description");
  for (const comparator of manifest.comparators ?? []) {
    if (!comparator.description.trim())
      issues.push("importer_sdk.missing_extension_description");
    if (!comparator.valueTypes.length || comparator.valueTypes.some((value) => !value.trim()))
      issues.push("importer_sdk.invalid_comparator_types");
  }
  validateStateVisualizers(manifest, issues);
  return [...new Set(issues)];
}
function isSemanticVersion(value: string): boolean {
  return /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/.test(value);
}
function validateStateVisualizers(manifest: AutomationStudioImporterSdkManifest, issues: string[]): void {
  const seen = new Set<string>();
  for (const visualizer of manifest.stateVisualizers ?? []) {
    if (!visualizer.id.trim())
      issues.push("importer_sdk.missing_state_visualizer_id");
    if (seen.has(visualizer.id))
      issues.push("importer_sdk.duplicate_state_visualizer_id");
    seen.add(visualizer.id);
    if (!isSemanticVersion(visualizer.version))
      issues.push("importer_sdk.invalid_state_visualizer_version");
    if (!visualizer.label.trim())
      issues.push("importer_sdk.missing_state_visualizer_label");
    if (visualizer.supportedNamespaces?.some((value) => !value.trim()) || hasDuplicates(visualizer.supportedNamespaces))
      issues.push("importer_sdk.invalid_state_visualizer_namespaces");
    if (visualizer.supportedKinds?.some((value) => !value.trim()) || hasDuplicates(visualizer.supportedKinds))
      issues.push("importer_sdk.invalid_state_visualizer_kinds");
    if (visualizer.supportedRendererIds?.some((value) => !value.trim()) || hasDuplicates(visualizer.supportedRendererIds))
      issues.push("importer_sdk.invalid_state_visualizer_renderer_ids");
    const metadata = visualizer.metadata ?? {};
    if (typeof metadata.domainId === "string" && metadata.domainId !== manifest.domainId)
      issues.push("importer_sdk.state_visualizer_identity_mismatch");
    if (typeof metadata.packageId === "string" && metadata.packageId !== manifest.packageId)
      issues.push("importer_sdk.state_visualizer_identity_mismatch");
    if (claimsExecutableCapability(metadata))
      issues.push("importer_sdk.state_visualizer_claims_capability");
  }
}
function hasDuplicates(values: string[] | undefined): boolean {
  return Boolean(values && new Set(values).size !== values.length);
}
function claimsExecutableCapability(metadata: JsonObject): boolean {
  const blocked = new Set(["implementationKey", "runtimeCapabilities", "permissions", "grants", "storageAccess", "filesystemRoots", "networkDestinations", "execute", "module", "import"]);
  return Object.keys(metadata).some((key) => blocked.has(key));
}
