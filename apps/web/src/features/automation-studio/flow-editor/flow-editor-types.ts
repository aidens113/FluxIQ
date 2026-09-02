import type { Edge, Node } from "@xyflow/react";
import type { AutomationFlowNodeData } from "./node-types";
import type { AutomationSelection } from "../shared/selection-contracts";
import type { AutomationGraphProblem } from "./graph-validation";

export type AutomationGraphDocument = {
  nodes: Array<Node<AutomationFlowNodeData>>;
  edges: Edge[];
};

export type AutomationGraphSaveResult = {
  ok: boolean;
  state: "saved" | "failed" | "conflict";
  message: string;
};

export type AutomationGraphFocusRequest = {
  revision: number;
  problem: AutomationGraphProblem;
};

export type FlowEditorProps = {
  activeRef: { current: boolean };
  editable: boolean;
  entries: any[];
  policy: any;
  taskGraph?: any;
  taskGraphDraft?: AutomationGraphDocument | null;
  recoverableDraft?: { savedAt: number; stale: boolean } | null;
  nativeNodeDefinitions: any[];
  recordings: any[];
  selectedNode: any;
  focusRequest?: AutomationGraphFocusRequest | null;
  selectedTimeline: any;
  signals: any[];
  onSaveGraph(graph: AutomationGraphDocument): Promise<AutomationGraphSaveResult>;
  onGraphDraftChange(graph: AutomationGraphDocument | null): void;
  onDirtyChange(dirty: boolean): void;
  onOpenValidation(): void;
  onOpenNodeState(nodeId: string): void;
  onRestoreDraft(): void;
  onDiscardDraft(): void;
  onReloadGraph(): void;
  setSelection(selection: AutomationSelection): void;
};
