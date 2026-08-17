"use client";

import { Sparkles, Zap } from "lucide-react";
import { useState } from "react";
import { recordingDateTimeLabel } from "../hierarchy/model";
import type { RecordingProcessingStatus } from "../types";

export function AutomationProposalGeneratorView(props: {
  actionStatus: string;
  selectedRecording: any;
  proposals: any[];
  generationBusy: boolean;
  recordingProcessing: RecordingProcessingStatus | null;
  onGenerateAssisted(input: { title?: string; instructions?: string; constraints?: string }): Promise<boolean | void>;
  onGenerateDirect(): Promise<boolean | void>;
}) {
  const [title, setTitle] = useState("");
  const [instructions, setInstructions] = useState("");
  const [constraints, setConstraints] = useState("");
  const recording = props.selectedRecording;
  const existing = recording?.recordingId
    ? props.proposals.filter((proposal) => (proposal.recordingId ?? proposal.metadata?.recordingId) === recording.recordingId)
    : [];
  const processing = recording?.recordingId && props.recordingProcessing?.recordingId === recording.recordingId
    ? props.recordingProcessing
    : null;
  return (
    <section className="automation-proposal-generator">
      {processing ? <div className="automation-timeline-processing-overlay" role="status" aria-live="polite">
        <div className="automation-timeline-processing-panel">
          <strong>{processing.label}</strong>
          <span>{processing.detail}</span>
          <div className="automation-timeline-processing-track">
            <div style={{ width: `${Math.min(100, Math.max(0, processing.progress))}%` }} />
          </div>
          <small>{Math.round(Math.min(100, Math.max(0, processing.progress)))}%</small>
        </div>
      </div> : null}
      <header>
        <div>
          <strong>Proposal Generator</strong>
          <span>{recording ? `Recording: ${recording.metadata?.name ?? recordingDateTimeLabel(recording)}` : "Select a finalized recording to generate proposals."}</span>
        </div>
        {existing.length ? <small>{existing.length} existing proposal{existing.length === 1 ? "" : "s"}</small> : null}
      </header>
      <section className="automation-proposal-generator-section primary">
        <header>
          <Sparkles size={18} aria-hidden />
          <div><strong>LLM-Assisted</strong><span>Use instructions to turn the messy recording into a cleaner Flow proposal.</span></div>
        </header>
        <label><span>Proposal title</span><input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Optional title for this attempt" /></label>
        <label><span>Goal / instructions</span><textarea rows={5} value={instructions} onChange={(event) => setInstructions(event.target.value)} placeholder="Describe what the Flow should do, what to ignore, and what should become reusable." /></label>
        <label><span>Optional constraints</span><textarea rows={3} value={constraints} onChange={(event) => setConstraints(event.target.value)} placeholder="Add guardrails, naming preferences, state assumptions, or things the proposal must not do." /></label>
        <button className="button primary" disabled={!recording?.endedAt || props.generationBusy} onClick={() => void props.onGenerateAssisted({ title, instructions, constraints })} type="button">
          <Sparkles size={14} aria-hidden />Generate Assisted Proposal
        </button>
      </section>
      <div className="automation-proposal-generator-or"><span />OR<span /></div>
      <section className="automation-proposal-generator-section">
        <header>
          <Zap size={18} aria-hidden />
          <div><strong>Direct Generation</strong><span>Run deterministic mapper/mining generation without LLM instructions.</span></div>
        </header>
        <button className="button" disabled={!recording?.endedAt || props.generationBusy} onClick={() => void props.onGenerateDirect()} type="button">
          <Zap size={14} aria-hidden />Generate Direct Proposal
        </button>
      </section>
      {props.actionStatus ? <p className="automation-proposal-generator-status">{props.actionStatus}</p> : null}
    </section>
  );
}
