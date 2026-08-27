"use client";

export function AutomationProposalGeneratorView(props: { selectedRecording?: any }) {
  const recordingId = props.selectedRecording?.recordingId;
  const recordingName = props.selectedRecording?.metadata?.name ?? props.selectedRecording?.name ?? recordingId;
  return (
    <section className="automation-proposal-generator automation-legacy-compatibility">
      <header>
        <div><strong>Legacy Proposal Generator</strong><span>Read-only compatibility view</span></div>
      </header>
      <div className="automation-project-empty">
        <strong>Recording-driven proposal generation is retired</strong>
        <span>Recordings remain optional evidence. Current runtime changes and generated Flow edits are reviewed as Adaptations.</span>
        {recordingName ? <small>Legacy recording context: {recordingName}</small> : null}
        <div className="automation-legacy-compatibility-actions">
          <a className="button button-primary" href="?view=adaptations">Open Adaptations</a>
          <a className="button" href={recordingId ? "?view=recording-timeline&recordingId=" + encodeURIComponent(recordingId) : "?view=recordings"}>Open Recordings</a>
        </div>
      </div>
    </section>
  );
}