"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useProgramTransport } from "../../../../../../features/automation-studio/data/use-program-transport";
import { FlowEditorView } from "../../../../../../features/automation-studio/flow-editor";
import { InspectorView } from "../../../../../../features/automation-studio/inspector";
import type { AutomationSelection } from "../../../../../../features/automation-studio/shared/selection-contracts";
import { GraphActions } from "./GraphActions";
import { graphInspectorContext } from "./inspector-context";
import { selectedEditorNode } from "./selected-node";
import { useFlowGraph } from "./use-flow-graph";
import "./flow-graph.css";

const STATE_NOTICE = "A step's page state is kept with each run of this Flow. Open the run in Runs to see it.";

/**
 * The existing graph canvas and its step details for one Flow, with nothing of the old workspace
 * around them: a way back to the Flow, Undo, Redo and Save, the canvas, and the details of the
 * picked step beside it.
 */
export function FlowGraphEditor(props: { flowId: string; projectId: string }) {
  const { flowId, projectId } = props;
  const studio = useProgramTransport("automation-studio");
  const graph = useFlowGraph(studio, projectId, flowId);
  const [selection, setSelection] = useState<AutomationSelection | null>(null);
  const [dirty, setDirty] = useState(false);
  const [notice, setNotice] = useState("");
  const activeRef = useRef(true);
  const detailsRef = useRef<HTMLElement>(null);

  // Leaving with unsaved changes asks first, as any editor does.
  useEffect(() => {
    if (!dirty) return undefined;
    const ask = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", ask);
    return () => window.removeEventListener("beforeunload", ask);
  }, [dirty]);

  const ready = graph.load.state === "ready" ? graph.load : null;
  const node = useMemo(() => selectedEditorNode(selection), [selection]);
  const context = useMemo(
    () => graphInspectorContext({ selection, flow: ready?.flow ?? null, node, definitions: ready?.definitions ?? [] }),
    [selection, ready?.flow, ready?.definitions, node]
  );
  const showState = useCallback(() => setNotice(STATE_NOTICE), []);
  // The canvas's check of the graph puts its findings in the step details; this takes the person there.
  const showDetails = useCallback(() => detailsRef.current?.focus(), []);
  const reload = useCallback(() => {
    setDirty(false);
    graph.reload();
  }, [graph.reload]);
  const discardDraft = useCallback(() => graph.setDraft(null), [graph.setDraft]);
  // This page passes no `recoverableDraft`, so the canvas never offers Restore and never calls this.
  const restoreNothing = useCallback(() => undefined, []);
  const flowHref = `/flows/${encodeURIComponent(flowId)}?project=${encodeURIComponent(projectId)}`;

  return (
    <div className="flow-graph">
      <header className="flow-graph-header">
        <p><Link href={flowHref}>Back to the Flow</Link></p>
        <h1>{ready ? `${ready.flow.name}: graph` : "Graph"}</h1>
        <p>Every step of this Flow and how they connect. Changes here are kept only when you press Save.</p>
        <GraphActions dirty={dirty} />
        {notice ? <p role="status">{notice} <Link href="/runs">Open Runs</Link></p> : null}
      </header>
      {graph.load.state === "loading" ? <p role="status">Opening the graph…</p> : null}
      {graph.load.state === "error"
        ? <p role="alert">{graph.load.message} <button className="button" type="button" onClick={reload}>Try again</button></p>
        : null}
      {ready ? (
        <div className="flow-graph-body">
          <div className="flow-graph-canvas">
            <FlowEditorView
              activeRef={activeRef}
              editable
              entries={[]}
              policy={null}
              taskGraph={ready.flow}
              taskGraphDraft={graph.draft}
              nativeNodeDefinitions={ready.definitions}
              recordings={[]}
              selectedNode={node}
              focusRequest={null}
              selectedTimeline={null}
              signals={[]}
              projectId={projectId}
              onSaveGraph={graph.save}
              onGraphDraftChange={graph.setDraft}
              onDirtyChange={setDirty}
              onOpenValidation={showDetails}
              onOpenNodeState={showState}
              onRestoreDraft={restoreNothing}
              onDiscardDraft={discardDraft}
              onReloadGraph={reload}
              setSelection={setSelection}
            />
          </div>
          <aside aria-label="Step details" className="flow-graph-details" ref={detailsRef} tabIndex={-1}>
            <InspectorView context={context} onOpenState={showState} onUpdateEditorNodeSelection={setSelection} />
          </aside>
        </div>
      ) : null}
    </div>
  );
}
