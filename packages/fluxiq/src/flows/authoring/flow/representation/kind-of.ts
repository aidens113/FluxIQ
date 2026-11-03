import type { AutomationStudioFlowArtifact } from "../index.ts";
import type { AutomationStudioFlowRepresentationKind } from "./index.ts";
import { AUTOMATION_STUDIO_FLOW_REPRESENTATION_VERSION } from "./version.ts";

/**
 * Returns the explicit representation written by current Automation Studio
 * authoring paths. Missing values belong to pre-invariant documents and must
 * be classified by the service while it still has persisted-history context.
 */
export function automationStudioFlowRepresentationKind(flow: Pick<AutomationStudioFlowArtifact, "metadata">): AutomationStudioFlowRepresentationKind | undefined {
  const metadata = flow.metadata;
  if (metadata?.flowRepresentationVersion !== AUTOMATION_STUDIO_FLOW_REPRESENTATION_VERSION) return undefined;
  const kind = metadata.flowRepresentationKind;
  return kind === "orchestration" || kind === "subflow_graph" || kind === "legacy_single_graph" ? kind : undefined;
}
