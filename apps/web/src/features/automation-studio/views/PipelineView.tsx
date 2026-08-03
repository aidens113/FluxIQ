"use client";

import { Link2, Sparkles } from "lucide-react";
import { useState } from "react";
import type { JsonObject } from "../../programs/program-api";
import { DataTable, StatusBadge, StatusText, SummaryStrip } from "../../programs/shared-ui";
import { readableToken } from "../timeline/view-model";
import { formatTime } from "./view-utils";

type TabButton<T extends string> = { id: T; label: string; count?: number };
type PipelineStageTab = "normalize" | "mine" | "propose";

const pipelineStageTabs: Array<TabButton<PipelineStageTab>> = [
  { id: "normalize", label: "Normalize" },
  { id: "mine", label: "Mine Evidence" },
  { id: "propose", label: "Propose Task" }
];

export function AutomationPipelineView(props: {
  actionStatus: string;
  models: any[];
  pipelineArtifacts: any;
  recordings: any[];
  selectedRecording: any;
  selectedTimeline: any;
  timelines: any[];
  onNormalizeRecording(recordingId: string): Promise<void>;
  onPipelineAction(endpoint: string, payload: JsonObject, success: string): Promise<void>;
  onOpenRecording(recordingId: string): void;
  onRunRecordingPipeline(recordingId: string): Promise<void>;
  onProcessProposalWithLlm(proposalId: string): void;
}) {
  const [activeStage, setActiveStage] = useState<PipelineStageTab>("normalize");
  const sourceRecording = props.selectedRecording ?? props.recordings[0];
  const sourceTimeline = sourceRecording ? props.timelines.find((timeline) => timeline.recordingId === sourceRecording.recordingId) : props.selectedTimeline;
  const sourceRecordingId = sourceRecording?.recordingId;
  const sourceTimelineId = sourceTimeline?.normalizedTimelineId;
  const sourceTaskId = sourceRecording?.taskId ?? sourceRecordingId;
  const reviews = (props.pipelineArtifacts?.normalizationReviews ?? []).filter((review: any) => !sourceRecordingId || review.recordingId === sourceRecordingId);
  const miningRuns = (props.pipelineArtifacts?.miningRuns ?? []).filter((run: any) => !sourceTimelineId || run.normalizedTimelineId === sourceTimelineId);
  const miningRunIds = new Set(miningRuns.map((run: any) => run.miningRunId));
  const facts = (props.pipelineArtifacts?.evidenceFacts ?? miningRuns.flatMap((run: any) => run.facts ?? [])).filter((fact: any) => !sourceRecordingId || fact.recordingId === sourceRecordingId || miningRunIds.has(fact.miningRunId));
  const observations = (props.pipelineArtifacts?.evidenceObservations ?? miningRuns.flatMap((run: any) => run.observations ?? [])).filter((observation: any) => !sourceRecordingId || observation.recordingId === sourceRecordingId || miningRunIds.has(observation.miningRunId));
  const correlations = (props.pipelineArtifacts?.stateActionCorrelations ?? miningRuns.flatMap((run: any) => run.correlations ?? [])).filter((correlation: any) => !sourceRecordingId || correlation.recordingId === sourceRecordingId || miningRunIds.has(correlation.miningRunId));
  const claims = (props.pipelineArtifacts?.evidenceClaims ?? miningRuns.flatMap((run: any) => run.claims ?? [])).filter((claim: any) => !sourceRecordingId || claim.recordingId === sourceRecordingId || miningRunIds.has(claim.miningRunId));
  const learnedModels = (props.models.length ? props.models : props.pipelineArtifacts?.learnedTaskModels ?? []).filter((model: any) => {
    if (!sourceRecordingId && !sourceTaskId) return true;
    return model.sourceRecordings?.includes(sourceRecordingId) || model.taskId === sourceTaskId;
  });
  const learnedModelIds = new Set(learnedModels.map((model: any) => model.learnedTaskModelId));
  const proposals = (props.pipelineArtifacts?.policyProposals ?? []).filter((proposal: any) => {
    if (!sourceTaskId && learnedModelIds.size === 0) return true;
    return proposal.metadata?.recordingId === sourceRecordingId || learnedModelIds.has(proposal.learnedTaskModelId) || proposal.policy?.taskId === sourceTaskId;
  });
  const latestProposal = [...proposals].sort((left, right) => (right.generatedAt ?? 0) - (left.generatedAt ?? 0))[0];
  const runStage = async (stage: PipelineStageTab) => {
    if (!sourceRecording?.recordingId) return;
    if (stage === "normalize") return await props.onNormalizeRecording(sourceRecording.recordingId);
    if (stage === "mine") return await props.onPipelineAction("mine-recording-evidence", { recordingId: sourceRecording.recordingId }, "Evidence mined.");
    return await props.onPipelineAction("propose-policy-from-model", { recordingId: sourceRecording.recordingId }, "Task draft proposed.");
  };
  return (
    <section className="automation-pipeline-workspace">
      <header className="automation-pipeline-header">
        <div>
          <strong>Recording Pipeline</strong>
          <span>{sourceRecording ? `${sourceRecording.metadata?.name ?? sourceRecording.recordingId} | ${sourceTimeline?.timeline?.length ?? sourceRecording.timeline?.length ?? 0} entries` : "Select a recording pipeline from the sidebar"}</span>
        </div>
        <div className="automation-pipeline-controls">
          <button className="button" disabled={!sourceRecording} onClick={() => sourceRecording && props.onOpenRecording(sourceRecording.recordingId)} type="button"><Link2 size={13} aria-hidden />Open Source Recording Timeline</button>
          <button className="button button-primary" disabled={!sourceRecording} onClick={() => sourceRecording && void props.onRunRecordingPipeline(sourceRecording.recordingId)} type="button"><Sparkles size={13} aria-hidden />Run Full Pipeline</button>
        </div>
        {props.actionStatus ? <StatusText value={props.actionStatus} /> : null}
      </header>
      <div className="automation-pipeline-tabs" role="tablist" aria-label="Pipeline stages">
        {pipelineStageTabs.map((tab) => <button className={activeStage === tab.id ? "selected" : ""} key={tab.id} onClick={() => setActiveStage(tab.id)} role="tab" type="button">{tab.label}</button>)}
      </div>
      <section className="automation-pipeline-stage-panel">
        <header>
          <div>
            <strong>{pipelineStageTabs.find((tab) => tab.id === activeStage)?.label}</strong>
            <span>{pipelineStageDescription(activeStage)}</span>
          </div>
          <button className="button" disabled={!sourceRecording} onClick={() => void runStage(activeStage)} type="button">Run Stage</button>
        </header>
        {activeStage === "normalize" ? <>
          <SummaryStrip items={[["Raw entries", sourceRecording?.timeline?.length ?? 0], ["Normalized entries", sourceTimeline?.timeline?.length ?? 0], ["Mappings", reviews[0]?.mappings?.length ?? 0], ["Wait clips", reviews[0]?.waitClips?.length ?? 0], ["Issues", sourceTimeline?.issues?.length ?? 0]]} />
          <DataTable columns={["Timeline", "Recording", "Entries", "Generated"]} rows={(sourceTimeline ? [sourceTimeline] : []).map((timeline) => [timeline.normalizedTimelineId, timeline.recordingId, timeline.timeline?.length ?? 0, formatTime(timeline.generatedAt)])} empty="No normalized timeline has been generated for the selected recording." />
          <DataTable columns={["Entry", "Type", "Offset", "Source"]} rows={(sourceTimeline?.timeline ?? []).slice(0, 80).map((entry: any) => [entry.id, readableToken(entry.type ?? "entry"), `${entry.monotonicOffsetMs ?? 0}ms`, entry.correlationId ?? entry.metadata?.normalizedFrom ?? "-"])} empty="Run Normalize to generate normalized timeline entries." />
          <DataTable columns={["Raw Entry", "Normalized Entries", "Status", "Reason"]} rows={(reviews[0]?.mappings ?? []).slice(0, 80).map((mapping: any) => [mapping.rawEntryId, mapping.normalizedEntryIds?.join(", ") || "-", readableToken(mapping.status ?? "mapped"), mapping.reason ?? "-"])} empty="Normalization mappings are created when the normalization review artifact exists." />
        </> : null}
        {activeStage === "mine" ? <>
          <SummaryStrip items={[["Mining runs", miningRuns.length], ["Facts", facts.length], ["Observations", observations.length], ["Correlations", correlations.length], ["Claims", claims.length]]} />
          <DataTable columns={["Fact", "Kind", "When", "Source"]} rows={facts.slice(0, 80).map((fact: any) => [fact.title ?? fact.factId, readableToken(fact.kind ?? "fact"), `${fact.offsetMs ?? 0}ms`, fact.domain?.label ?? fact.source?.entryId ?? "-"])} empty="Run Mine Evidence after normalization to extract facts from the timeline." />
          <DataTable columns={["Observation", "Kind", "Subject", "Summary"]} rows={observations.slice(0, 80).map((observation: any) => [observation.title ?? observation.observationId, readableToken(observation.kind ?? "observation"), observation.subject?.label ?? observation.subject?.statePath ?? observation.subject?.eventType ?? "-", observation.summary ?? "-"])} empty="No domain observations have been extracted yet." />
          <DataTable columns={["Correlation", "State Element", "Relation", "Timing"]} rows={correlations.slice(0, 80).map((correlation: any) => [correlation.descriptor?.label ?? correlation.statePath, readableToken(correlation.elementKind ?? "state"), readableToken(correlation.relation ?? "related"), correlation.timing?.afterMs !== undefined ? `${correlation.timing.afterMs}ms after action` : `${correlation.timing?.beforeMs ?? 0}ms before action`])} empty="No state/action correlations have been mined yet." />
          <DataTable columns={["Claim", "Type", "Confidence", "Support"]} rows={claims.slice(0, 80).map((claim: any) => [claim.title ?? claim.claimId, readableToken(claim.claimType ?? "claim"), claim.confidence ? `${Math.round((claim.confidence.score ?? 0) * 100)}% - ${claim.confidence.basis ?? ""}` : "-", `${claim.observationIds?.length ?? 0} observations / ${claim.factIds?.length ?? 0} facts`])} empty="No evidence claims have been mined yet." />
        </> : null}
        {activeStage === "propose" ? <>
          <SummaryStrip items={[["Drafts", proposals.length], ["Latest nodes", latestProposal?.policy?.nodes?.length ?? 0], ["Latest edges", latestProposal?.policy?.edges?.length ?? 0], ["Claims Used", latestProposal?.policy?.nodes?.reduce((total: number, node: any) => total + (node.sourceEvidence?.filter((evidence: any) => evidence.layer === "evidence_claim").length ?? 0), 0) ?? 0], ["Status", latestProposal?.status ?? "none"]]} />
          <DataTable columns={["Draft", "Status", "Task", "Steps", "Summary"]} rows={proposals.map((proposal: any) => [proposal.proposalId, <StatusBadge key={proposal.proposalId} value={proposal.status ?? "draft"} />, proposal.policy?.taskId ?? "-", proposal.policy?.nodes?.length ?? 0, proposal.summary ?? "-"])} empty="No task drafts proposed yet." />
          <DataTable columns={["Node", "Actions", "Requirements", "Expected Effects", "Support"]} rows={(latestProposal?.policy?.nodes ?? []).map((node: any) => [node.label ?? node.id, node.actions?.map((action: any) => action.actionType).join(", ") || "-", node.eligibility?.conditions?.length ?? 0, node.successConditions?.conditions?.length ?? 0, node.sourceEvidence?.map((evidence: any) => evidence.artifactId).join(", ") || "-"])} empty="Run Propose Task to generate task nodes from mined evidence." />
          <div className="automation-pipeline-apply-actions">
            <button className="button button-primary" disabled={!latestProposal} onClick={() => latestProposal && void props.onPipelineAction("approve-policy-proposal", { proposalId: latestProposal.proposalId }, "Task draft applied.")} type="button">Apply Directly</button>
            <button className="button" disabled={!latestProposal} onClick={() => latestProposal && props.onProcessProposalWithLlm(latestProposal.proposalId)} type="button"><Sparkles size={13} aria-hidden />Process With LLM</button>
          </div>
        </> : null}
      </section>
      <PipelineSummary artifacts={{ normalizationReviews: reviews, miningRuns, policyProposals: proposals }} onApprove={(proposalId) => props.onPipelineAction("approve-policy-proposal", { proposalId }, "Task draft applied.")} />
    </section>
  );
}

function pipelineStageDescription(stage: PipelineStageTab): string {
  if (stage === "normalize") return "Prepare the raw recording timeline for downstream analysis.";
  if (stage === "mine") return "Extract signals, effects, and evidence windows from the recording.";
  return "Create and apply the task draft produced from mined evidence.";
}
function PipelineSummary(props: { artifacts: any; onApprove(proposalId: string): Promise<void> }) {
  const reviews = props.artifacts?.normalizationReviews ?? [];
  const miningRuns = props.artifacts?.miningRuns ?? [];
  const proposals = props.artifacts?.policyProposals ?? [];
  const latestProposal = proposals[0];
  return (
    <section className="automation-pipeline-summary">
      <header><strong>Pipeline</strong><span>{reviews.length + miningRuns.length + proposals.length} visible stage artifacts</span></header>
      <div>
        <span>Normalize {reviews.length}</span>
        <span>Mining {miningRuns.length}</span>
        <span>Drafts {proposals.length}</span>
      </div>
      {latestProposal ? <article>
        <strong>{latestProposal.status === "approved" ? "Applied task draft" : "Task draft"}</strong>
        <small>{latestProposal.summary}</small>
        {latestProposal.status !== "approved" ? <button className="button button-primary" onClick={() => void props.onApprove(latestProposal.proposalId)} type="button">Apply</button> : null}
      </article> : null}
    </section>
  );
}
