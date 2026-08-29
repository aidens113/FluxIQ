import type { NodeStatePhase } from "fluxiq/automation-studio";
import type { JsonObject } from "../../programs/program-api";
import type { AutomationSelection } from "../shared/selection-contracts";
import { inspectorIdentity } from "./inspector-identity";
import { inspectorStateNodeId } from "./panel-helpers";
import { buildInspectorPanel } from "./panel-registry";
import type {
  InspectorIdentity,
  InspectorPanelContext,
  InspectorPanelModel
} from "./types";

export type InspectorStateOpenRequest = {
  nodeId?: string;
  sourceId?: string;
  phase?: NodeStatePhase;
  evidenceId?: string;
  factPath?: string;
  proposalId?: string;
  recordingId?: string;
  timelineEntryId?: string;
  stateSnapshotId?: string;
};

export type InspectorEditorSelection = Extract<AutomationSelection, { kind: "editor-node" }>;

export type InspectorModel = Readonly<{
  identity: InspectorIdentity | null;
  panel: InspectorPanelModel | null;
  selection: AutomationSelection | null;
  editorSelection: InspectorEditorSelection | null;
  stateNodeId: string;
  stateOpenRequest: InspectorStateOpenRequest | null;
}>;

const emptyModel: InspectorModel = Object.freeze({
  identity: null,
  panel: null,
  selection: null,
  editorSelection: null,
  stateNodeId: "",
  stateOpenRequest: null
});
const modelCache = new WeakMap<InspectorPanelContext, InspectorModel>();

export function createInspectorModel(
  context: InspectorPanelContext | null
): InspectorModel {
  if (!context) return emptyModel;
  const cached = modelCache.get(context);
  if (cached) return cached;
  const selection = context.selection;
  const stateNodeId = inspectorStateNodeId(selection, context.node);
  const model: InspectorModel = Object.freeze({
    identity: inspectorIdentity(selection, context),
    panel: buildInspectorPanel(context),
    selection,
    editorSelection: selection.kind === "editor-node" ? selection : null,
    stateNodeId,
    stateOpenRequest: stateNodeId ? stateRequest(selection, stateNodeId) : null
  });
  modelCache.set(context, model);
  return model;
}

export function openInspectorState(
  model: InspectorModel,
  command: (request: InspectorStateOpenRequest) => void
): void {
  if (model.stateOpenRequest) command(model.stateOpenRequest);
}

export function updateInspectorEditorSelection(
  selection: InspectorEditorSelection,
  command: (selection: InspectorEditorSelection) => void,
  update: { customDescription?: string; parameterValues?: JsonObject }
): void {
  command({ ...selection, node: { ...selection.node, ...update } });
}

function stateRequest(
  selection: AutomationSelection,
  nodeId: string
): InspectorStateOpenRequest {
  if (selection.kind === "state") {
    return {
      nodeId,
      phase: selection.phase ?? "input",
      ...(selection.sourceId ? { sourceId: selection.sourceId } : {}),
      ...(selection.evidenceId ? { evidenceId: selection.evidenceId } : {}),
      ...(selection.factPath ? { factPath: selection.factPath } : {}),
      ...(selection.proposalId ? { proposalId: selection.proposalId } : {}),
      ...(selection.recordingId ? { recordingId: selection.recordingId } : {}),
      ...(selection.timelineEntryId ? { timelineEntryId: selection.timelineEntryId } : {}),
      ...(selection.stateSnapshotId ? { stateSnapshotId: selection.stateSnapshotId } : {})
    };
  }
  return { nodeId, phase: "input" };
}

