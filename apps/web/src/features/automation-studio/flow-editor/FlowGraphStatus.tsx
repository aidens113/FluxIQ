"use client";

import type { FlowEditorProps } from "./flow-editor-types";
import type { FlowEditorController } from "./useFlowEditorController";

export function FlowGraphStatus({ controller, props }: { controller: FlowEditorController; props: FlowEditorProps }) {
  const { codeOwned, flowEdges, flowHistoryState, flowNodes, flowViewportState, flowViewportStats, saveState } = controller;
  return <>
    <div aria-live="polite" className={`automation-graph-save-state ${saveState}`} role="status"><span aria-hidden />{saveState === "saved" ? "Saved" : saveState === "unsaved" ? "Unsaved changes" : saveState === "saving" ? "Saving" : saveState === "conflict" ? "Save conflict" : "Save failed"}</div>
    <div aria-live="polite" className={`automation-graph-viewport-state ${flowViewportState}`} role="status">
      <span>{flowViewportState}</span><strong>{flowNodes.length} nodes / {flowEdges.length} routes</strong><small>{flowViewportStats.cachedPartitions} partitions cached | {Math.round(flowHistoryState.estimatedBytes / 1024)} KiB history</small>
    </div>
    {props.recoverableDraft ? <div className={props.recoverableDraft.stale ? "automation-draft-recovery stale" : "automation-draft-recovery"} role="status">
      <div><strong>{props.recoverableDraft.stale ? "Unsaved draft from an older Flow version" : "Unsaved draft available"}</strong><span>Recovered from {new Date(props.recoverableDraft.savedAt).toLocaleString()}.</span></div>
      <div><button className="button button-primary" onClick={props.onRestoreDraft} type="button">Restore Draft</button><button className="button" onClick={props.onDiscardDraft} type="button">Discard</button></div>
    </div> : null}
    {codeOwned ? <div className="automation-source-warning"><strong>Code-owned Flow</strong><span>The compiled graph is read-only. Change its module and recompile, or explicitly convert it back to visual ownership.</span></div> : null}
  </>;
}