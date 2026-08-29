import { mergeById } from "./project-artifacts";
import {
  emptyPipelineArtifacts,
  flowSummariesToCatalogEntries,
  proposalSummariesToPolicyArtifacts,
  proposalSummariesToRecordingFlowArtifacts,
  recordingSummariesToRecordingStubs,
  runtimeSummaryToSessionStub
} from "./project-summary-converters";
import { mergeFlowDetails, mergeRecordingSummaries } from "./project-change-reconciliation";

export type AutomationRuntimeSummaryProjection = {
  workspaceSummary: any | null;
  recordings: any[] | null;
  timelines: null;
  runtimeSessions: any[] | null;
  pipelineArtifacts: any | null;
  projectArtifacts: null;
  flows: any[] | null;
  domains: null;
};

export function projectRuntimeSummaryRecordingState(summary: any, current: any[]): any[] {
  return mergeRecordingSummaries(current, recordingSummariesToRecordingStubs(summary.recordings ?? []));
}

export function projectRuntimeSummaryPipelineState(summary: any, current: any): any {
  const proposals = summary.proposals ?? [];
  return {
    ...emptyPipelineArtifacts(),
    policyProposals: mergeById(
      (current?.policyProposals ?? []).filter((item: any) =>
        proposals.some((summaryItem: any) => summaryItem.proposalId === item.proposalId)
      ),
      proposalSummariesToPolicyArtifacts(proposals),
      "proposalId"
    ),
    recordingFlowProposals: mergeById(
      (current?.recordingFlowProposals ?? []).filter((item: any) =>
        proposals.some((summaryItem: any) => summaryItem.proposalId === item.proposalId)
      ),
      proposalSummariesToRecordingFlowArtifacts(proposals),
      "proposalId"
    )
  };
}

export function projectRuntimeSummaryFlowState(summary: any, current: any[]): any[] {
  return mergeFlowDetails(
    flowSummariesToCatalogEntries(summary.flows ?? []),
    current.filter((entry: any) => entry?.flow?.metadata?.summaryOnly !== true)
  );
}

export function projectRuntimeSummaryProjection(summary: any | null): AutomationRuntimeSummaryProjection {
  if (!summary) {
    return {
      workspaceSummary: null,
      recordings: null,
      timelines: null,
      runtimeSessions: null,
      pipelineArtifacts: null,
      projectArtifacts: null,
      flows: null,
      domains: null
    };
  }
  return {
    workspaceSummary: summary,
    recordings: recordingSummariesToRecordingStubs(summary.recordings ?? []),
    timelines: null,
    runtimeSessions: (summary.runtime ?? []).map(runtimeSummaryToSessionStub),
    pipelineArtifacts: projectRuntimeSummaryPipelineState(summary, null),
    projectArtifacts: null,
    flows: flowSummariesToCatalogEntries(summary.flows ?? []),
    domains: null
  };
}
