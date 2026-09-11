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
    const proposal = await this.recordings.readPipelineArtifact<PolicyProposalArtifact>(input.projectId, "policyProposals", input.proposalId);
    if (!proposal) throw new Error("Unknown policy proposal.");
    const targetTaskId = input.targetTaskId?.trim() || proposal.policy.taskId;
    const policyInput = input.policyOverride ? { ...input.policyOverride, taskId: targetTaskId } : { ...proposal.policy, taskId: targetTaskId };
    const proposalForApproval: PolicyProposalArtifact = {
      ...proposal,
      policy: policyInput,
      patch: {
        ...(proposal.patch ?? {
          schemaVersion: "0.1" as const,
          patchId: `patch.${safeSegment(proposal.proposalId)}`,
          basePolicyId: null,
          mergeStrategy: "append_or_branch" as const,
          sourceRecordingIds: [String(proposal.metadata?.recordingId ?? "")].filter(Boolean),
          sourceMiningRunIds: [String(proposal.metadata?.miningRunId ?? "")].filter(Boolean),
          generatedAt: proposal.generatedAt
        }),
        targetTaskId,
        nodes: policyInput.nodes,
        edges: policyInput.edges
      }
    };
    const project = await this.projects.findProject(input.projectId);
    const requestedFlowId = input.targetFlowId?.trim();
    const resolvedFlowId = requestedFlowId ?? `flow.${safeSegment(targetTaskId)}`;
    const existingFlow = await this.repositories.flows.get(resolvedFlowId);
    if (existingFlow && existingFlow.projectId !== input.projectId) throw new Error(`Flow ${requestedFlowId} belongs to another project.`);
    if (input.requireExistingFlow && !existingFlow) throw new Error("The target Flow is no longer available. Open an existing Flow or save this proposal as a new Flow.");
    const existingTask = input.targetTaskId ? await this.facade.getProjectArtifact(input.projectId, "task", targetTaskId).then((artifact) => artifact as AutomationStudioTaskArtifact).catch(() => null) : null;
    if (input.requireExistingTask && !existingTask) throw new Error("The legacy target is no longer available. Select an existing canonical Flow or save this proposal as a new Flow.");
    const existingPolicyId = typeof existingFlow?.metadata?.policyId === "string" ? existingFlow.metadata.policyId : typeof existingTask?.metadata?.policyId === "string" ? existingTask.metadata.policyId : undefined;
    const existingPolicy = existingPolicyId ? await this.repositories.policyGraphs.get(existingPolicyId).catch(() => null) : null;
    const mergedPolicy = input.policyOverride
      ? withPolicyOutgoingEdges({
        ...policyInput,
        policyId: existingPolicy?.policyId ?? policyInput.policyId,
        taskId: targetTaskId,
        sourceEvidence: uniqueEvidenceReferences([...(existingPolicy?.sourceEvidence ?? []), ...(policyInput.sourceEvidence ?? proposal.policy.sourceEvidence ?? [])]),
        generatedMetadata: {
          ...(policyInput.generatedMetadata ?? proposal.policy.generatedMetadata),
          generatedAt: Date.now()
        },
        metadata: {
          ...(existingPolicy?.metadata ?? {}),
          ...(policyInput.metadata ?? {}),
          proposalId: proposal.proposalId,
          sourceRecordingIds: uniqueStrings([
            ...asStringArray(existingPolicy?.metadata?.sourceRecordingIds),
            ...asStringArray(policyInput.metadata?.sourceRecordingIds),
            String(proposal.metadata?.recordingId ?? "")
          ])
        }
      })
      : mergeProposalPatchIntoPolicy(existingPolicy, proposalForApproval);
    const approvedAt = Date.now();
    await this.repositories.policyGraphs.put(mergedPolicy);
    await new ProgramJsonStore<JsonObject>(this.projectPaths.projectFile(input.projectId, "policies", `${safeSegment(mergedPolicy.policyId)}.json`), () => ({})).write({ policy: mergedPolicy as unknown as JsonObject });
    const flowInput: Parameters<typeof policyGraphToAutomationStudioFlow>[1] = {
      flowId: existingFlow?.flowId ?? resolvedFlowId,
      existingFlow: existingFlow ? canonicalFlowDocument(existingFlow) : null,
      proposalId: proposal.proposalId
    };
    if (typeof proposal.metadata?.recordingId === "string") flowInput.recordingId = proposal.metadata.recordingId;
    const baseFlow = existingFlow ?? await this.facade.saveFlow({ projectId: input.projectId, flow: createBlankAutomationStudioFlowArtifact({
      flowId: resolvedFlowId,
      projectId: input.projectId,
      name: existingTask?.name ?? humanTaskName(mergedPolicy.taskId),
      description: proposal.summary,
      scope: flowScopeForProject(project),
      origin: "recorded"
    }) });
    const { graphFlow } = await this.flowSubflowMigration.ensureProposalPrimarySubflow(baseFlow);
    const projected = policyGraphToAutomationStudioFlow(mergedPolicy, {
      ...flowInput,
      flowId: graphFlow.flowId,
      existingFlow: canonicalFlowDocument(graphFlow)
    });
    await this.facade.saveFlow({ projectId: input.projectId, flow: {
      ...graphFlow,
      nodes: projected.nodes,
      edges: projected.edges,
      evidenceReferences: uniqueEvidenceReferences([...(graphFlow.evidenceReferences ?? []), ...(mergedPolicy.sourceEvidence ?? [])]),
      publication: { status: "draft" },
      metadata: { ...(graphFlow.metadata ?? {}), source: "policy_proposal", policyId: mergedPolicy.policyId, policyTaskId: mergedPolicy.taskId, sourceRecordingIds: asStringArray(mergedPolicy.metadata?.sourceRecordingIds), lastProposalId: proposal.proposalId, ...(typeof proposal.metadata?.recordingId === "string" ? { lastRecordingId: proposal.metadata.recordingId } : {}) }
    } });
    const savedFlow = await this.facade.saveFlow({ projectId: input.projectId, flow: {
      ...baseFlow,
      name: existingFlow?.name ?? existingTask?.name ?? humanTaskName(mergedPolicy.taskId),
      description: proposal.summary,
      evidenceReferences: uniqueEvidenceReferences([...(baseFlow.evidenceReferences ?? []), ...(mergedPolicy.sourceEvidence ?? [])]),
      publication: { status: "draft" },
      metadata: { ...(baseFlow.metadata ?? {}), source: "policy_proposal", policyId: mergedPolicy.policyId, policyTaskId: mergedPolicy.taskId, sourceRecordingIds: asStringArray(mergedPolicy.metadata?.sourceRecordingIds), lastProposalId: proposal.proposalId, ...(typeof proposal.metadata?.recordingId === "string" ? { lastRecordingId: proposal.metadata.recordingId } : {}) }
    } });
    const approved = { ...proposalForApproval, policy: mergedPolicy, status: "approved" as const, approvedAt, metadata: { ...(proposalForApproval.metadata ?? {}), approvedFlowId: savedFlow.flowId } };
    await this.recordings.writePipelineArtifact(input.projectId, "policyProposals", approved.proposalId, approved as unknown as JsonObject);
    return approved;
  }
}
