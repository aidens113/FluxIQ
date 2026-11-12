import type { AutomationStudioLlmEvidenceRuntimeBinding } from "../llm/harness-options/index.ts";
import type { AutomationStudioHostRuntimeBoundary } from "../automation-host/index.ts";
import type { AutomationStudioNativeNodeRuntime } from "../native-nodes/index.ts";
import type { TrustedModuleBuildIdentity } from "../build-identity/modules/index.ts";

/** Trusted runtime implementations for one domain; registration does not bind service slots. */
export type AutomationStudioRuntimeBundle = {
  runtime: string;
  domainId: string;
  evidence?: AutomationStudioLlmEvidenceRuntimeBinding | undefined;
  host?: AutomationStudioHostRuntimeBoundary | undefined;
  nodes?: AutomationStudioNativeNodeRuntime | undefined;
  nodesIdentity?: TrustedModuleBuildIdentity | null | undefined;
};
