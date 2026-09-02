"use client";

import { lazy, memo, Suspense } from "react";
import type { FlowEditorProps, AutomationGraphSaveResult } from "./flow-editor-types";
import { useFlowEditorController } from "./useFlowEditorController";

const FlowGraphCanvas = lazy(() => import("./FlowGraphCanvas").then((module) => ({
  default: module.FlowGraphCanvas
})));

export type { AutomationGraphSaveResult };

export const FlowEditorView = memo(function FlowEditorView(props: FlowEditorProps) {
  const controller = useFlowEditorController(props);
  return (
    <Suspense fallback={<div className="automation-view-loading">Opening Nodes...</div>}>
      <FlowGraphCanvas controller={controller} props={props} />
    </Suspense>
  );
});
