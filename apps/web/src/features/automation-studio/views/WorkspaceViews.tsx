"use client";

import { DataTable, StatusBadge, SummaryStrip } from "../../programs/shared-ui";
import type { AutomationDockTab, AutomationSelection } from "../types";
import { timelineEntrySummary } from "../timeline/view-model";
import { groupByNamespace } from "./view-utils";
export function AutomationRecordingWorkspace(props: { recordings: any[]; selectedRecording: any; selectedTimeline: any; setSelection(selection: AutomationSelection): void }) {
  const entries = props.selectedTimeline?.timeline ?? props.selectedRecording?.timeline ?? [];
  const checkpoints = entries.filter((entry: any) => entry.type === "state_checkpoint").length;
  const deltas = entries.filter((entry: any) => entry.type === "state_delta").reduce((total: number, entry: any) => total + (entry.deltas?.length ?? 0), 0);
  return (
    <section className="automation-recording-stage">
      <header><strong>{props.selectedRecording?.recordingId ?? "No recording"}</strong><span>{entries.length} entries | {checkpoints} checkpoints | {deltas} deltas</span></header>
      <div className="context-chip-row">
        <span>Environment {props.selectedRecording?.environment?.label ?? "-"}</span>
        <span>Notes {props.selectedRecording?.notes?.length ?? 0}</span>
        <span>Started {props.selectedRecording?.startedAt ? new Date(props.selectedRecording.startedAt).toLocaleTimeString() : "-"}</span>
      </div>
      <div className="automation-state-list">
        {props.recordings.map((recording) => (
          <button className={recording.recordingId === props.selectedRecording?.recordingId ? "selected" : ""} key={recording.recordingId} onClick={() => props.setSelection({ kind: "recording", id: recording.recordingId })} type="button">
            <strong>{recording.recordingId}</strong>
            <span>{recording.environment?.label ?? "Environment"} | {recording.timeline?.length ?? 0} raw entries</span>
          </button>
        ))}
      </div>
      <div className="automation-track-stack">
        {["note", "action", "state_delta", "state_checkpoint"].map((type) => (
          <div className="automation-track" key={type}>
            <strong>{type.replace("_", " ")}</strong>
            <div>
              {entries.filter((entry: any) => entry.type === type).map((entry: any) => (
                <button key={entry.id} onClick={() => props.setSelection({ kind: "timeline", id: entry.id })} style={{ left: `${Math.min(92, Math.max(0, (entry.monotonicOffsetMs ?? 0) / 18))}%` }} type="button">
                  <span>{timelineEntrySummary(entry)}</span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export function AutomationSignalWorkspace(props: { domains: any[]; signals: any[]; setSelection(selection: AutomationSelection): void }) {
  const namespaces = groupByNamespace(props.signals);
  return (
    <section className="automation-signal-board">
      <div className="automation-domain-contracts">
        <header><strong>Recording Domains</strong><span>{props.domains.length} registered</span></header>
        {props.domains.map((domain) => (
          <article key={domain.domainId}>
            <strong>{domain.label ?? domain.domainId}</strong>
            <span>{domain.domainId}</span>
            <small>{domain.eventTypes?.length ?? 0} event types | {domain.stateReducers?.length ?? 0} reducers | {domain.observationExtractors?.length ?? 0} extractors</small>
          </article>
        ))}
        {!props.domains.length ? <span>No recording domain contracts are registered by the host repo yet.</span> : null}
      </div>
      {Object.entries(namespaces).map(([namespace, namespaceSignals]) => (
        <div className="automation-state-namespace" key={namespace}>
          <strong>{namespace}</strong>
          {namespaceSignals.map((signal) => (
            <button key={signal.path} onClick={() => props.setSelection({ kind: "signal", id: signal.path })} type="button">
              <span>{signal.registryId}</span>
              <strong>{signal.path}</strong>
              <small>{signal.type} | {signal.comparator?.kind ?? "exact"} | {signal.volatility}</small>
            </button>
          ))}
        </div>
      ))}
      {!props.signals.length ? <span>No signal registries loaded.</span> : null}
    </section>
  );
}

export function AutomationRuntimeWorkspace(props: { pipelineArtifacts: any; timelines: any[]; models: any[]; policies: any[]; runtimeSessions: any[] }) {
  const proposals = props.pipelineArtifacts?.policyProposals ?? [];
  const replays = props.pipelineArtifacts?.replayResults ?? [];
  return (
    <section className="automation-runtime-stage">
      <SummaryStrip items={[
        ["Runs", props.runtimeSessions.length],
        ["Timelines", props.timelines.length],
        ["Models", props.models.length],
        ["Proposals", proposals.length],
        ["Runnable Nodes", props.policies.reduce((total, policy) => total + (policy.nodes?.length ?? 0), 0)]
      ]} />
      <DataTable columns={["Run", "Target", "Status", "Attempts", "Effects"]} rows={props.runtimeSessions.map((session) => [
        session.runId?.slice(0, 8) ?? "-",
        `${session.targetKind ?? "flow"}:${session.targetId ?? session.flowId ?? "-"}`,
        <StatusBadge key={session.runId} value={session.status ?? "queued"} />,
        session.trace?.attempts?.length ?? 0,
        session.trace?.effects?.length ?? 0
      ])} empty="No runtime sessions have been started for this project." />
      <DataTable columns={["Model", "Task", "Clusters", "Transitions", "Questions"]} rows={props.models.map((model) => [
        model.learnedTaskModelId,
        model.taskId,
        model.actionClusters?.length ?? 0,
        model.transitions?.length ?? 0,
        model.unresolvedQuestions?.length ?? 0
      ])} empty="No learned task models available." />
      <DataTable columns={["Proposal", "Status", "Policy", "Nodes", "Summary"]} rows={proposals.map((proposal: any) => [
        proposal.proposalId,
        <StatusBadge key={proposal.proposalId} value={proposal.status} />,
        proposal.policy?.policyId ?? "-",
        proposal.policy?.nodes?.length ?? 0,
        proposal.summary ?? "-"
      ])} empty="No policy proposals generated yet." />
      <DataTable columns={["Replay", "Status", "Recording", "Policy", "Matched", "Warnings"]} rows={replays.map((replay: any) => [
        replay.replayId,
        <StatusBadge key={replay.replayId} value={replay.status} />,
        replay.recordingId,
        replay.policyId,
        `${replay.matchedActions}/${replay.expectedActions}`,
        replay.timingWarnings?.length ?? 0
      ])} empty="No replay/test results yet." />
    </section>
  );
}


export function AutomationRunsWorkspace(props: { pipelineArtifacts: any; runtimeSessions: any[] }) {
  const replays = props.pipelineArtifacts?.replayResults ?? [];
  return (
    <section className="automation-runs-workspace">
      <header>
        <div><strong>Runs</strong><span>Replay and runtime validation history</span></div>
      </header>
      <SummaryStrip items={[["Runtime Runs", props.runtimeSessions.length], ["Replay Runs", replays.length], ["Failures", props.runtimeSessions.filter((session) => session.status === "failed").length + replays.filter((replay: any) => replay.status === "failed").length], ["Validated", replays.filter((replay: any) => replay.status === "matched").length]]} />
      <DataTable columns={["Run", "Target", "Status", "Attempts", "Effects"]} rows={props.runtimeSessions.map((session) => [
        session.runId?.slice(0, 8) ?? "-",
        `${session.targetKind ?? "flow"}:${session.targetId ?? session.flowId ?? "-"}`,
        <StatusBadge key={session.runId} value={session.status ?? "queued"} />,
        session.trace?.attempts?.length ?? 0,
        session.trace?.effects?.length ?? 0
      ])} empty="No runtime sessions have been started for this project." />
      <DataTable columns={["Replay", "Status", "Recording", "Proposal", "Matched", "Warnings"]} rows={replays.map((replay: any) => [
        replay.replayId,
        <StatusBadge key={replay.replayId} value={replay.status ?? "unknown"} />,
        replay.recordingId,
        replay.policyId,
        `${replay.matchedActions ?? 0}/${replay.expectedActions ?? 0}`,
        replay.timingWarnings?.length ?? 0
      ])} empty="No replay validations generated yet." />
    </section>
  );
}
export function AutomationProblemsWorkspace(props: { problems: any[] }) {
  return <DataTable columns={["Severity", "Artifact", "Message"]} rows={props.problems.map((problem) => [<StatusBadge key={problem.id} value={problem.severity} />, problem.artifactId ?? problem.artifactKind ?? "-", problem.message])} empty="No validation, runtime, or fixture problems are currently reported." />;
}
