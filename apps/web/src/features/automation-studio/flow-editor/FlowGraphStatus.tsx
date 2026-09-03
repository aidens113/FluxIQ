"use client";

import type { FlowEditorProps } from "./flow-editor-types";
import type { FlowEditorController } from "./useFlowEditorController";

export function FlowGraphStatus({ controller, props }: { controller: FlowEditorController; props: FlowEditorProps }) {
  const { codeOwned, flowEdges, flowHistoryState, flowNodes, flowViewportState, flowViewportStats, saveMessage, saveState } = controller;
  const saveLabel = saveState === "saved"
    ? "Saved"
    : saveState === "unsaved"
      ? "Unsaved changes"
      : saveState === "saving"
        ? "Saving"
        : saveState === "conflict"
          ? "Save conflict"
          : "Save failed";
  return <>
    <div aria-live="polite" className={`automation-graph-save-state ${saveState}`} role="status" title={saveMessage || saveLabel}><span aria-hidden />{saveLabel}{saveMessage && (saveState === "failed" || saveState === "conflict") ? `: ${saveMessage}` : null}</div>
    <div aria-live="polite" className={`automation-graph-viewport-state ${flowViewportState}`} role="status">
      <span>{flowViewportState}</span><strong>{flowNodes.length} nodes / {flowEdges.length} routes</strong><small>{flowViewportStats.cachedPartitions} partitions cached | {Math.round(flowHistoryState.estimatedBytes / 1024)} KiB history</small>
    </div>
    {props.recoverableDraft ? <div className={props.recoverableDraft.stale ? "automation-draft-recovery stale" : "automation-draft-recovery"} role="status">
      <div><strong>{props.recoverableDraft.stale ? "Unsaved draft from an older Flow version" : "Unsaved draft available"}</strong><span>Recovered from {new Date(props.recoverableDraft.savedAt).toLocaleString()}.</span></div>
      <div><button className="button button-primary" onClick={props.onRestoreDraft} type="button">Restore Draft</button><button className="button" onClick={props.onDiscardDraft} type="button">Discard</button></div>
    </div> : null}
    {saveState === "conflict" ? <div className="automation-draft-recovery stale" role="alert"><div><strong>The saved Flow changed</strong><span>Your graph draft is preserved. Use Save Project to retry, or reload the newest saved graph; the recovery copy remains available.</span></div><div><button className="button" onClick={props.onReloadGraph} type="button">Reload Saved Graph</button></div></div> : null}
    {codeOwned ? <div className="automation-source-warning"><strong>Code-owned Flow</strong><span>The compiled graph is read-only. Change its module and recompile, or explicitly convert it back to visual ownership.</span></div> : null}
  </>;
}
