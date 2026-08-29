"use client";

import type { RecordingProcessingStatus } from "./recording-status";

export function RecordingProcessingOverlay(props: { processing: RecordingProcessingStatus | null }) {
  if (!props.processing) return null;
  const progress = Math.min(100, Math.max(0, props.processing.progress));
  return (
    <div className="automation-timeline-processing-overlay" role="status" aria-live="polite">
      <div className="automation-timeline-processing-panel">
        <strong>{props.processing.label}</strong>
        <span>{props.processing.detail}</span>
        <div className="automation-timeline-processing-track"><div style={{ width: `${progress}%` }} /></div>
        <small>{Math.round(progress)}%</small>
      </div>
    </div>
  );
}