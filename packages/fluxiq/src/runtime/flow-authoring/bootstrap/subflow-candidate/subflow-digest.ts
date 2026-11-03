import { createHash } from "node:crypto";
import { automationStudioCandidateFingerprint as fingerprint } from "../candidate/index.ts";
import type { AutomationStudioFlowBootstrapSubflow } from "../plan/index.ts";
import type { AutomationStudioSubflowScopeIdentity } from "./contracts.ts";

/**
 * The digest of one scoped proposal (automation-project-agents-plan.md,
 * `Scoped submission`). It binds what a whole candidate's fingerprint binds
 * today -- project, Flow, the accepted base, the instruction text the check
 * read, and the graph -- and, beside them, the brief the proposal answers:
 * its build, brief, the structure plan's digest and the subflow it is for. So
 * two briefs never produce matching receipts, and an amended plan (a new
 * `planDigest`) invalidates every proposal made under the old one. The bytes
 * hashed are the candidate fingerprint's canonical JSON (`../candidate/digest.ts`),
 * under a version of their own, so this can never equal a whole candidate's digest.
 */
export function automationStudioSubflowProposalDigest(input: {
  scope: AutomationStudioSubflowScopeIdentity;
  projectId: string;
  flowId: string;
  baseDependencyDigest: string;
  instructionText: string;
  subflows: readonly AutomationStudioFlowBootstrapSubflow[];
}): string {
  const bound = {
    fingerprintVersion: "subflow.proposal.v1",
    buildId: input.scope.buildId,
    briefId: input.scope.briefId,
    planDigest: input.scope.planDigest,
    subflowKey: input.scope.subflowKey,
    projectId: input.projectId,
    flowId: input.flowId,
    baseDependencyDigest: input.baseDependencyDigest,
    instructionText: input.instructionText,
    // An optional field present as `undefined` is no field: JSON drops it, as a stored plan would.
    subflows: JSON.parse(JSON.stringify(input.subflows)) as unknown
  };
  return createHash("sha256").update(JSON.stringify(fingerprint.snapshot(bound))).digest("hex");
}
