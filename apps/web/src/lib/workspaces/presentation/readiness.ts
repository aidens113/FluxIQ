import { WorkspacePresentationError } from "./failure";
import type { WorkspacePresentationInstance, WorkspacePresentationProfile } from "./model";

/** Explicit projection: host/provider diagnostic strings never enter a service payload. */
export function workspacePresentationReadiness(instance: WorkspacePresentationInstance, profile: WorkspacePresentationProfile) {
  try {
    const studio = instance.programs.automationStudio;
    const native = studio.nativeRuntimeSummary(instance.activeDomainId);
    const generation = studio.getFlowBootstrapGenerationRuntimeReadiness();
    const reusable = studio.reusableLlmContextStatus();
    const counts = [native.definitionCount, native.recordingMapperCount, generation.llmEvidenceRuntime.toolCount];
    const flags = [native.bound, generation.providerResolverConfigured, generation.nativeNodeRegistryConfigured, generation.llmEvidenceRuntime.bound, reusable.enabled, reusable.writeEnabled];
    if (counts.some(value => !Number.isSafeInteger(value) || value < 0) || flags.some(value => typeof value !== "boolean") || typeof reusable.contentProtection !== "string") throw new WorkspacePresentationError("runtime_unavailable");
    return {
      nativeImporterRuntimeBound: native.bound,
      nativeNodeDefinitionCount: native.definitionCount,
      recordingMapperCount: native.recordingMapperCount,
      providerResolverConfigured: generation.providerResolverConfigured,
      nativeNodeRegistryConfigured: generation.nativeNodeRegistryConfigured,
      llmEvidenceRuntime: { bound: generation.llmEvidenceRuntime.bound, toolCount: generation.llmEvidenceRuntime.toolCount },
      reusableLlmContext: {
        enabled: reusable.enabled, writeEnabled: reusable.writeEnabled,
        contentProtection: profile === "service" ? reusable.contentProtection === "unavailable" ? "unavailable" : "available" : reusable.contentProtection,
        ...(reusable.blockerCode === "reusable_context.content_protection_unavailable" ? { blockerCode: reusable.blockerCode } : {})
      }
    };
  } catch {
    throw new WorkspacePresentationError("runtime_unavailable");
  }
}
