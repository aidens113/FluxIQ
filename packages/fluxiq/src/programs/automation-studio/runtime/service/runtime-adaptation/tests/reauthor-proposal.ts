// Test support: what the service's build answers a re-author.
import type { AutomationStudioGenerateFlowBootstrapAdaptationProposal } from "../../flow-bootstrap-commands/index.ts";

/**
 * A legacy proposal for project `project.one`, flow `flow.one`, as the
 * service's build returns it to a re-author. A re-author request never asks for
 * candidate authoring, and since t299 the build refuses anything that is not
 * `status: "proposed"` before approving it (`../reauthor-build.ts`), so a stub
 * of the build must answer the whole proposal, not only its id and accounting.
 */
export function automationStudioReauthorProposed(
  adaptationId: string,
  accounting: Partial<AutomationStudioGenerateFlowBootstrapAdaptationProposal["accounting"]> = {}
): AutomationStudioGenerateFlowBootstrapAdaptationProposal {
  return {
    projectId: "project.one", flowId: "flow.one", adaptationId, status: "proposed", riskLevel: "low",
    sourceInstructionIds: [], baseDependencyDigest: "digest.one", baseSettingsRevision: 1,
    accounting: { requestId: `request.${adaptationId}`, estimatedInputTokens: 0, ...accounting }
  };
}
