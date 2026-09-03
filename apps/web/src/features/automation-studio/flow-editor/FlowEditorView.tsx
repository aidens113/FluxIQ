"use client";

import { lazy, memo, Suspense } from "react";
import type { FlowEditorProps, AutomationGraphSaveResult } from "./flow-editor-types";
import { useFlowEditorController } from "./useFlowEditorController";

const FlowGraphCanvas = lazy(() => import("./FlowGraphCanvas").then((module) => ({
  default: module.FlowGraphCanvas
})));

export type { AutomationGraphSaveResult };

export const FlowEditorView = memo(function FlowEditorView(props: FlowEditorProps) {
  const loadError = props.taskGraph?.metadata?.detailLoadError;
  if (typeof loadError === "string" && loadError) {
    return (
      <div className="automation-view-loading" role="alert">
        <span>Saved Nodes could not be loaded: {loadError}</span>
        <button className="button" onClick={props.onReloadGraph} type="button">Retry</button>
      </div>
    );
  }
  if (!props.taskGraph || props.taskGraph.metadata?.summaryOnly === true) {
    return <div aria-label="Opening node editor" aria-live="polite" aria-busy="true" className="automation-view-loading" />;
  }
  return <HydratedFlowEditorView {...props} />;
});

const HydratedFlowEditorView = memo(function HydratedFlowEditorView(props: FlowEditorProps) {
  const controller = useFlowEditorController(props);
  return (
    <Suspense fallback={<div className="automation-view-loading">Opening Nodes...</div>}>
      <FlowGraphCanvas controller={controller} props={props} />
    </Suspense>
  );
});
