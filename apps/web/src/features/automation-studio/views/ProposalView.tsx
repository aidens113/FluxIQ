"use client";

import { CheckCircle2, Link2, RefreshCcw, Route, Sparkles } from "lucide-react";
import type { JsonObject } from "../../programs/program-api";
import { StatusBadge, StatusText, SummaryStrip } from "../../programs/shared-ui";
import { buildProposalViewModel, type ProposalStepViewModel } from "../evidence/view-model";

export function AutomationProposalView(props: {
  actionStatus: string;
  pipelineArtifacts: any;
  recordings: any[];
  selectedProposal: any;
  selectedRecording: any;
  onOpenRecording(recordingId: string): void;
  onPipelineAction(endpoint: string, payload: JsonObject, success: string): Promise<boolean | void>;
  onProcessFinalizedRecording(recordingId: string, force?: boolean): Promise<boolean | void>;
  onProcessProposalWithLlm(proposalId: string): void;
}) {
  const proposal = props.selectedProposal;
  const recording = props.selectedRecording ?? props.recordings.find((item) => item.recordingId === proposal?.metadata?.recordingId);
  const model = buildProposalViewModel({ artifacts: props.pipelineArtifacts, proposal, recording });
  return (
    <section className="automation-proposal-workspace">
      <header className="automation-proposal-header">
        <div>
          <strong>{model ? `Task Proposal: ${model.title}` : "Task Proposal"}</strong>
          <span>{model ? `Source recording ${model.source}` : "Select a generated proposal from the sidebar."}</span>
        </div>
        <div className="automation-pipeline-controls">
          <button className="button" disabled={!recording} onClick={() => recording && props.onOpenRecording(recording.recordingId)} type="button"><Link2 size={13} aria-hidden />Open Source Recording</button>
          <button className="button" disabled={!recording} onClick={() => recording && void props.onProcessFinalizedRecording(recording.recordingId, true)} type="button"><RefreshCcw size={13} aria-hidden />Regenerate Proposal</button>
          <button className="button button-primary" disabled={!proposal} onClick={() => proposal && void props.onPipelineAction("approve-policy-proposal", { proposalId: proposal.proposalId }, "Task draft applied.")} type="button"><CheckCircle2 size={13} aria-hidden />Apply Directly</button>
          <button className="button" disabled={!proposal} onClick={() => proposal && props.onProcessProposalWithLlm(proposal.proposalId)} type="button"><Sparkles size={13} aria-hidden />Process With LLM</button>
        </div>
        {props.actionStatus ? <StatusText value={props.actionStatus} /> : null}
      </header>
      <section className="automation-proposal-body">
        {!model ? <div className="automation-project-empty compact"><strong>No proposal selected</strong><span>Finalized recordings generate proposals automatically. Regenerate from a source recording if needed.</span></div> : null}
        {model ? <>
          <section className="automation-proposal-summary-panel">
            <div>
              <span>Task draft</span>
              <strong>{model.title}</strong>
              <p>{model.summary}</p>
            </div>
            <StatusBadge value={model.status} />
          </section>
          <SummaryStrip items={[["Unique steps", model.steps.length], ["Recorded items", model.rawStepCount], ["Evidence signals", model.evidenceCount], ["Generated", model.generated]]} />
          <section className="automation-proposal-step-list">
            {model.steps.map((step, index) => <ProposalStepCard key={step.id} index={index} step={step} />)}
            {!model.steps.length ? <div className="automation-evidence-empty">No task steps were generated for this proposal.</div> : null}
          </section>
        </> : null}
      </section>
    </section>
  );
}

function ProposalStepCard(props: { index: number; step: ProposalStepViewModel }) {
  return (
    <article className="automation-proposal-step-card">
      <div className="automation-proposal-step-number">{props.index + 1}</div>
      <div className="automation-proposal-step-content">
        <header>
          <div>
            <span>{props.step.confidence} confidence</span>
            <strong>{props.step.label}</strong>
          </div>
          {props.step.transition ? <small>{props.step.transition}</small> : null}
        </header>
        <p>{props.step.occurrenceCount > 1 ? `${props.step.occurrenceCount} similar recorded occurrences were grouped into this step.` : props.step.description}</p>
        <div className="automation-proposal-step-grid">
          <StepList title="Actions" items={props.step.actions} />
          {props.step.requirements.length ? <StepList title="Requirements" items={props.step.requirements} /> : null}
          {props.step.expectedEffects.length ? <StepList title="Expected Result" items={props.step.expectedEffects} /> : null}
        </div>
        {props.step.evidence.length ? <div className="automation-proposal-evidence-strip">
          <strong><Route size={14} aria-hidden />Supporting Evidence</strong>
          {props.step.evidence.slice(0, 5).map((signal) => <span key={signal.id}>{signal.title}: {signal.relation}</span>)}
        </div> : null}
      </div>
    </article>
  );
}

function StepList(props: { title: string; items: string[] }) {
  return (
    <div className="automation-proposal-step-list-block">
      <strong>{props.title}</strong>
      <ul>
        {props.items.map((item, index) => <li key={`${item}:${index}`}>{item}</li>)}
      </ul>
    </div>
  );
}
