"use client";

import { memo } from "react";
import type { FlowEditorProps, AutomationGraphSaveResult } from "./flow-editor-types";
import { FlowGraphCanvas } from "./FlowGraphCanvas";
import { useFlowEditorController } from "./useFlowEditorController";

export type { AutomationGraphSaveResult };

export const FlowEditorView = memo(function FlowEditorView(props: FlowEditorProps) {
  const controller = useFlowEditorController(props);
  return <FlowGraphCanvas controller={controller} props={props} />;
});
