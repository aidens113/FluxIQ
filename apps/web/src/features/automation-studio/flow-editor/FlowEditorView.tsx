"use client";

import type { FlowEditorProps, AutomationGraphSaveResult } from "./flow-editor-types";
import { FlowGraphCanvas } from "./FlowGraphCanvas";
import { useFlowEditorController } from "./useFlowEditorController";

export type { AutomationGraphSaveResult };

export function FlowEditorView(props: FlowEditorProps) {
  const controller = useFlowEditorController(props);
  return <FlowGraphCanvas controller={controller} props={props} />;
}
