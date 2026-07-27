import type { FlowDocument, FlowNode } from "../../flows";

export type FlowEditorDocument = {
  id: string;
  title: string;
  flow: FlowDocument;
  selectedNodeId?: string;
  dirty: boolean;
};

export type FlowEditorNodePaletteItem = {
  id: string;
  label: string;
  description: string;
  template: FlowNode;
};
