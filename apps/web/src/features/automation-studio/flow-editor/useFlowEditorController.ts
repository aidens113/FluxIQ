"use client";

import type { FlowEditorProps } from "./flow-editor-types";
import { useFlowEditorCanvasInteractions } from "./useFlowEditorCanvasInteractions";
import { useFlowEditorCommands } from "./useFlowEditorCommands";
import { useFlowEditorGraphDocument } from "./useFlowEditorGraphDocument";
import { useFlowEditorPalette } from "./useFlowEditorPalette";
import { useFlowEditorSelection } from "./useFlowEditorSelection";

export function useFlowEditorController(props: FlowEditorProps) {
  const graph = useFlowEditorGraphDocument(props);
  const selection = useFlowEditorSelection(props, graph);
  const palette = useFlowEditorPalette(props);
  const commands = useFlowEditorCommands(props, graph, selection);
  const interactions = useFlowEditorCanvasInteractions(
    props,
    graph,
    selection,
    commands,
    palette
  );

  return {
    ...graph,
    ...selection,
    ...palette,
    ...commands,
    ...interactions
  };
}

export type FlowEditorController = ReturnType<typeof useFlowEditorController>;