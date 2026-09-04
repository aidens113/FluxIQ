"use client";

import { AutomationNodeParameterEditor } from "../parameters/ParameterEditor";
import { InspectorPanel } from "./InspectorPanel";
import {
  createInspectorModel,
  openInspectorState,
  updateInspectorEditorSelection,
  type InspectorEditorSelection,
  type InspectorStateOpenRequest
} from "./canonical-model";
import type { InspectorPanelContext, InspectorPanelModel } from "./types";

export type InspectorViewProps = {
  context: InspectorPanelContext | null;
  onOpenState(request: InspectorStateOpenRequest): void;
  onUpdateEditorNodeSelection(selection: InspectorEditorSelection): void;
};

export function InspectorView(props: InspectorViewProps) {
  const model = createInspectorModel(props.context);
  const editorSelection = model.editorSelection;
  const panel = editorSelection && model.panel
    ? editorPanel(model.panel, editorSelection, props.onUpdateEditorNodeSelection, props.context)
    : model.panel;
  return (
    <InspectorPanel
      identity={model.identity}
      model={panel}
      selection={model.selection}
      stateNodeId={model.stateNodeId}
      onOpenState={() => openInspectorState(model, props.onOpenState)}
    />
  );
}

function editorPanel(
  panel: InspectorPanelModel,
  selection: InspectorEditorSelection,
  command: InspectorViewProps["onUpdateEditorNodeSelection"],
  context: InspectorPanelContext | null
): InspectorPanelModel {
  const editor = (
    <AutomationNodeParameterEditor
      node={selection.node}
      {...(context?.referenceOptions ? { referenceOptions: context.referenceOptions } : {})}
      onChange={(parameterValues) => updateInspectorEditorSelection(
        selection,
        command,
        { parameterValues }
      )}
      onDescriptionChange={(customDescription) => updateInspectorEditorSelection(
        selection,
        command,
        { customDescription }
      )}
    />
  );
  return {
    ...panel,
    primaryContent: panel.primaryContent ? <>{editor}{panel.primaryContent}</> : editor
  };
}
