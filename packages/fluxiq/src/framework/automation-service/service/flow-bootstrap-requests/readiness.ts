import { AUTOMATION_STUDIO_FLOW_BOOTSTRAP_GENERATION_READINESS } from "../../../../api-contracts/automation.ts";
import type { AutomationStudioService } from "../../service.ts";

export function flowBootstrapGenerationReadiness(service: Pick<AutomationStudioService, "getFlowBootstrapGenerationRuntimeReadiness">) {
  const runtime = service.getFlowBootstrapGenerationRuntimeReadiness();
  const readiness = structuredClone(AUTOMATION_STUDIO_FLOW_BOOTSTRAP_GENERATION_READINESS);
  readiness.runtime = {
    providerResolverConfigured: runtime.providerResolverConfigured,
    nativeNodeRegistryConfigured: runtime.nativeNodeRegistryConfigured
  };
  readiness.supported = Object.values(readiness.runtime).every((configured) => configured === true);
  // Whether the deployment set the candidate start hook (D1): only a service that holds one says true.
  readiness.capabilities.candidateTrial.startReset = runtime.candidateTrial?.startReset === true;
  return readiness;
}
