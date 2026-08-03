"use client";

import { Link2, Sparkles } from "lucide-react";
import { useState } from "react";
import type { JsonObject } from "../../programs/program-api";
import { DataTable, StatusBadge, StatusText, SummaryStrip } from "../../programs/shared-ui";
import { readableToken } from "../timeline/view-model";
import { formatTime } from "./view-utils";

type TabButton<T extends string> = { id: T; label: string; count?: number };
type PipelineStageTab = "normalize" | "review" | "mine" | "learn" | "propose" | "replay";

const pipelineStageTabs: Array<TabButton<PipelineStageTab>> = [
  { id: "normalize", label: "Normalize" },
  { id: "review", label: "Review" },
  { id: "mine", label: "Mine Evidence" },
  { id: "learn", label: "Learn Model" },
  { id: "propose", label: "Propose Task" },
  { id: "replay", label: "Replay / Validate" }
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
  onRunRecordingPipeline(recordingId: string, taskId?: string): Promise<void>;
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
  const allLearnedModels = props.models.length ? props.models : props.pipelineArtifacts?.learnedTaskModels ?? [];
  const learnedModels = allLearnedModels.filter((model: any) => {
    if (!sourceRecordingId && !sourceTaskId) return true;
    return model.sourceRecordings?.includes(sourceRecordingId) || model.taskId === sourceTaskId;
  });
  const learnedModelIds = new Set(learnedModels.map((model: any) => model.learnedTaskModelId));
  const proposals = (props.pipelineArtifacts?.policyProposals ?? []).filter((proposal: any) => {
    if (!sourceTaskId && learnedModelIds.size === 0) return true;
    return learnedModelIds.has(proposal.learnedTaskModelId) || proposal.policy?.taskId === sourceTaskId;
  });
  const replays = (props.pipelineArtifacts?.replayResults ?? []).filter((replay: any) => !sourceRecordingId || replay.recordingId === sourceRecordingId);
  const latestProposal = [...proposals].sort((left, right) => (right.generatedAt ?? 0) - (left.generatedAt ?? 0))[0];
  const runStage = async (stage: PipelineStageTab) => {
    if (!sourceRecording?.recordingId) return;
    if (stage === "normalize") return await props.onNormalizeRecording(sourceRecording.recordingId);
    if (stage === "review") return await props.onPipelineAction("create-normalization-review", { recordingId: sourceRecording.recordingId }, "Normalization review created.");
    if (stage === "mine") return await props.onPipelineAction("mine-recording-evidence", { recordingId: sourceRecording.recordingId }, "Evidence mined.");
    if (stage === "learn") return await props.onPipelineAction("learn-task-model", { taskId: sourceTaskId ?? sourceRecording.recordingId }, "Task model learned.");
    if (stage === "propose") return await props.onPipelineAction("propose-policy-from-model", {}, "Task draft proposed.");
    return await props.onPipelineAction("replay-policy-against-recording", { recordingId: sourceRecording.recordingId }, "Replay validation completed.");
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
          <button className="button button-primary" disabled={!sourceRecording} onClick={() => sourceRecording && void props.onRunRecordingPipeline(sourceRecording.recordingId, sourceRecording.taskId)} type="button"><Sparkles size={13} aria-hidden />Run Full Pipeline</button>
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
          <SummaryStrip items={[["Raw entries", sourceRecording?.timeline?.length ?? 0], ["Normalized entries", sourceTimeline?.timeline?.length ?? 0], ["Checkpoints", (sourceTimeline?.timeline ?? sourceRecording?.timeline ?? []).filter((entry: any) => entry.type === "state_checkpoint").length], ["Issues", sourceTimeline?.issues?.length ?? 0]]} />
          <DataTable columns={["Timeline", "Recording", "Entries", "Generated"]} rows={(sourceTimeline ? [sourceTimeline] : []).map((timeline) => [timeline.normalizedTimelineId, timeline.recordingId, timeline.timeline?.length ?? 0, formatTime(timeline.generatedAt)])} empty="No normalized timeline has been generated for the selected recording." />
        </> : null}
        {activeStage === "review" ? <DataTable columns={["Review", "Recording", "Mappings", "Wait Clips"]} rows={reviews.map((review: any) => [review.reviewId, review.recordingId, review.mappings?.length ?? 0, review.waitClips?.length ?? 0])} empty="No normalization reviews generated yet." /> : null}
        {activeStage === "mine" ? <DataTable columns={["Mining Run", "Timeline", "Windows", "Effects", "Signals"]} rows={miningRuns.map((run: any) => [run.miningRunId, run.normalizedTimelineId, run.windows?.length ?? 0, run.actionEffects?.length ?? 0, run.conditionCandidates?.length ?? 0])} empty="No evidence mining runs generated yet." /> : null}
        {activeStage === "learn" ? <DataTable columns={["Model", "Task", "Clusters", "Transitions", "Questions"]} rows={learnedModels.map((model: any) => [model.learnedTaskModelId, model.taskId, model.actionClusters?.length ?? 0, model.transitions?.length ?? 0, model.unresolvedQuestions?.length ?? 0])} empty="No learned task models generated yet." /> : null}
        {activeStage === "propose" ? <>
          <DataTable columns={["Draft", "Status", "Task", "Steps", "Summary"]} rows={proposals.map((proposal: any) => [proposal.proposalId, <StatusBadge key={proposal.proposalId} value={proposal.status ?? "draft"} />, proposal.policy?.taskId ?? "-", proposal.policy?.nodes?.length ?? 0, proposal.summary ?? "-"])} empty="No task drafts proposed yet." />
          <div className="automation-pipeline-apply-actions">
            <button className="button button-primary" disabled={!latestProposal} onClick={() => latestProposal && void props.onPipelineAction("approve-policy-proposal", { proposalId: latestProposal.proposalId }, "Task draft applied.")} type="button">Apply Directly</button>
            <button className="button" disabled={!latestProposal} onClick={() => latestProposal && props.onProcessProposalWithLlm(latestProposal.proposalId)} type="button"><Sparkles size={13} aria-hidden />Process With LLM</button>
          </div>
        </> : null}
        {activeStage === "replay" ? <DataTable columns={["Replay", "Status", "Recording", "Matched", "Warnings"]} rows={replays.map((replay: any) => [replay.replayId, <StatusBadge key={replay.replayId} value={replay.status ?? "unknown"} />, replay.recordingId, `${replay.matchedActions ?? 0}/${replay.expectedActions ?? 0}`, replay.timingWarnings?.length ?? 0])} empty="No replay or validation runs generated yet." /> : null}
      </section>
      <PipelineSummary artifacts={{ normalizationReviews: reviews, miningRuns, learnedTaskModels: learnedModels, policyProposals: proposals, replayResults: replays }} selectedRecordingId={sourceRecording?.recordingId} onApprove={(proposalId) => props.onPipelineAction("approve-policy-proposal", { proposalId }, "Task draft applied.")} />
    </section>
  );
}

function pipelineStageDescription(stage: PipelineStageTab): string {
  if (stage === "normalize") return "Prepare the raw recording timeline for downstream analysis.";
  if (stage === "review") return "Inspect mappings, timing clips, and normalization quality.";
  if (stage === "mine") return "Extract signals, effects, and evidence windows from the recording.";
  if (stage === "learn") return "Build a task model from mined evidence.";
  if (stage === "propose") return "Create and apply the task draft produced by the learned model.";
  return "Replay the generated draft against the selected recording.";
}
function PipelineSummary(props: { artifacts: any; selectedRecordingId?: string; onApprove(proposalId: string): Promise<void> }) {
  const reviews = props.artifacts?.normalizationReviews ?? [];
  const miningRuns = props.artifacts?.miningRuns ?? [];
  const models = props.artifacts?.learnedTaskModels ?? [];
  const proposals = props.artifacts?.policyProposals ?? [];
  const replays = props.artifacts?.replayResults ?? [];
  const latestProposal = proposals[0];
  const latestReplay = replays.find((replay: any) => !props.selectedRecordingId || replay.recordingId === props.selectedRecordingId) ?? replays[0];
  return (
    <section className="automation-pipeline-summary">
      <header><strong>Pipeline</strong><span>{reviews.length + miningRuns.length + models.length + proposals.length + replays.length} artifacts</span></header>
      <div>
        <span>Reviews {reviews.length}</span>
        <span>Mining {miningRuns.length}</span>
        <span>Models {models.length}</span>
        <span>Drafts {proposals.length}</span>
        <span>Replays {replays.length}</span>
      </div>
      {latestProposal ? <article>
        <strong>{latestProposal.status === "approved" ? "Applied task draft" : "Task draft"}</strong>
        <small>{latestProposal.summary}</small>
        {latestProposal.status !== "approved" ? <button className="button button-primary" onClick={() => void props.onApprove(latestProposal.proposalId)} type="button">Apply</button> : null}
      </article> : null}
      {latestReplay ? <article>
        <strong>Replay {readableToken(latestReplay.status)}</strong>
        <small>{latestReplay.matchedActions}/{latestReplay.expectedActions} actions matched</small>
      </article> : null}
    </section>
  );
}
