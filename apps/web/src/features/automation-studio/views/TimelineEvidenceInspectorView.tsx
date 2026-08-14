"use client";

import { Link2, ListChecks, Route } from "lucide-react";
import type { ReactNode } from "react";
import { SummaryStrip } from "../../programs/shared-ui";
import { buildTimelineEvidenceViewModel, type EvidenceSignalViewModel } from "../evidence/view-model";

export function AutomationTimelineEvidenceInspectorView(props: {
  pipelineArtifacts: any;
  recordings: any[];
  selectedEntry: any;
  selectedRecording: any;
  selectedTimeline: any;
  onOpenRecording(recordingId: string): void;
  onOpenStateForTimelineEntry(recordingId: string, entryId: string): void;
}) {
  const recording = props.selectedRecording;
  const model = buildTimelineEvidenceViewModel({
    artifacts: props.pipelineArtifacts,
    entry: props.selectedEntry,
    recording,
    timeline: props.selectedTimeline
  });
  const hasStateMoment = Boolean(model.selectedMoment && props.selectedEntry && (props.selectedEntry.type === "state_checkpoint" || props.selectedEntry.type === "state_delta" || String(model.selectedMoment.type).includes("state")));
  return (
    <section className="automation-evidence-inspector-workspace">
      <header className="automation-proposal-header">
        <div>
          <strong>{model.selectedMoment?.title ?? "Timeline Evidence Inspector"}</strong>
          <span>{model.selectedMoment ? `${model.selectedMoment.type} at ${model.selectedMoment.offset}` : "Double-click a timeline item to inspect the useful state around it."}</span>
        </div>
        <div className="automation-pipeline-controls">
          <button className="button" disabled={!recording} onClick={() => recording && props.onOpenRecording(recording.recordingId)} type="button"><Link2 size={13} aria-hidden />Open Recording Timeline</button>
          <button className="button" disabled={!recording || !props.selectedEntry || !hasStateMoment} onClick={() => recording && props.selectedEntry && props.onOpenStateForTimelineEntry(recording.recordingId, props.selectedEntry.id)} type="button"><ListChecks size={13} aria-hidden />Open State</button>
        </div>
      </header>
      <section className="automation-evidence-inspector-body">
        <SummaryStrip items={[["Useful signals", model.signals.length], ["Recorded values", model.selectedMoment?.recordedData.length ?? 0]]} />
        {!model.selectedMoment ? <div className="automation-project-empty compact"><strong>No timeline item selected</strong><span>Double-click an action, state change, or event in the recording timeline.</span></div> : null}
        {model.selectedMoment ? <article className="automation-evidence-focus">
          <div>
            <span>Selected moment</span>
            <strong>{model.selectedMoment.summary}</strong>
          </div>
          <EvidenceKeyValues items={[
            ["Type", model.selectedMoment.type],
            ["Source", model.selectedMoment.source],
            ["Offset", model.selectedMoment.offset],
            ["Event", model.selectedMoment.event]
          ]} />
          {model.selectedMoment.recordedData.length ? <div className="automation-evidence-value-list">
            <strong>Recorded Data</strong>
            <div>{model.selectedMoment.recordedData.map(([key, value]) => <span key={key}>{key}: {value}</span>)}</div>
          </div> : null}
        </article> : null}
        <section className="automation-evidence-section">
          <header><strong>Useful State Signals</strong><span>State values the framework connected to this recorded moment.</span></header>
          <div className="automation-evidence-card-grid">
            {model.signals.map((signal) => <SignalCard key={signal.id} signal={signal} />)}
            {!model.signals.length ? <EmptyEvidence text="No useful state signals are linked to this moment yet." /> : null}
          </div>
        </section>
      </section>
    </section>
  );
}

function SignalCard(props: { signal: EvidenceSignalViewModel }) {
  return <EvidenceCard
    title={props.signal.title}
    eyebrow={`${props.signal.kind} | ${props.signal.relation}`}
    icon={<Route size={14} aria-hidden />}
    summary={props.signal.summary}
    items={[
      ["Timing", props.signal.timing],
      ["Value", props.signal.value],
      ["Before", props.signal.before],
      ["After", props.signal.after],
      ["Support", `${props.signal.supportCount} recorded item${props.signal.supportCount === 1 ? "" : "s"}`]
    ]}
  />;
}

function EvidenceCard(props: { title: string; eyebrow: string; summary?: string; icon?: ReactNode; items: Array<[string, unknown]> }) {
  return (
    <article className="automation-evidence-card">
      <header>
        <span>{props.icon}{props.eyebrow}</span>
        <strong>{props.title}</strong>
      </header>
      {props.summary ? <p>{props.summary}</p> : null}
      <EvidenceKeyValues items={props.items} />
    </article>
  );
}

function EvidenceKeyValues(props: { items: Array<[string, unknown]> }) {
  return (
    <dl className="automation-evidence-key-values">
      {props.items.map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{String(value ?? "-") || "-"}</dd></div>)}
    </dl>
  );
}

function EmptyEvidence(props: { text: string }) {
  return <div className="automation-evidence-empty">{props.text}</div>;
}
