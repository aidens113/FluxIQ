import { AutomationInstructionError } from "../instruction-led/index.ts";
import type { JsonObject } from "../../../../../core/index.ts";
import { ProgramJsonStore, safeSegment } from "../../../../_shared/storage.ts";
import {
  type AutomationStudioTaskArtifact,
  createBlankAutomationStudioFlowArtifact,
  type PolicyGraph
} from "../../../model/index.ts";
import type { CanonicalAutomationStudioRepositories } from "../../../storage/index.ts";
import {
  asStringArray,
  humanTaskName,
  mergeProposalPatchIntoPolicy,
  policyGraphToAutomationStudioFlow,
  type PolicyProposalArtifact,
  uniqueEvidenceReferences,
  withPolicyOutgoingEdges
} from "../../policy-model.ts";
import { uniqueStrings } from "../collections.ts";
import type { AutomationStudioFacadePorts } from "../facade-ports.ts";
import { canonicalFlowDocument, flowScopeForProject, type AutomationStudioFlowSubflowMigration } from "../flows/index.ts";
import type { AutomationStudioProjectPaths } from "../paths/index.ts";
import type { AutomationStudioProjectStore } from "../projects/index.ts";
import type { AutomationStudioRecordingStore } from "../recordings/index.ts";

// Approving a policy proposal. The proposal's patch is merged into whatever
// policy the destination already carries, the merged policy is written to both
// the canonical repository and the project's policies directory, and the
// projection lands on the destination's primary Subflow graph rather than the
// orchestration Flow that owns it.
export class AutomationStudioProposalApproval {
  constructor(
    private readonly projectPaths: AutomationStudioProjectPaths,
    private readonly projects: AutomationStudioProjectStore,
    private readonly recordings: AutomationStudioRecordingStore,
    private readonly repositories: CanonicalAutomationStudioRepositories,
    private readonly flowSubflowMigration: AutomationStudioFlowSubflowMigration,
    private readonly facade: AutomationStudioFacadePorts
  ) {}

  async approvePolicyProposal(input: { projectId: string; proposalId: string; targetFlowId?: string; targetTaskId?: string; policyOverride?: PolicyGraph; requireExistingFlow?: boolean; requireExistingTask?: boolean }): Promise<PolicyProposalArtifact> {
    throw new AutomationInstructionError("automation.instruction_led_authoring_required");
  }
}
