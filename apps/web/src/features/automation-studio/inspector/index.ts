export { InspectorView, type InspectorViewProps } from "./InspectorView";
export {
  createInspectorModel,
  openInspectorState,
  updateInspectorEditorSelection,
  type InspectorEditorSelection,
  type InspectorModel,
  type InspectorStateOpenRequest
} from "./canonical-model";
export { inspectorIdentity } from "./inspector-identity";
export { buildInspectorPanel, inspectorPanelKinds } from "./panel-registry";
export { selectInspectorPanelContext } from "./scoped-selection";
export type { InspectorPanelContext, InspectorScopedSelectors } from "./types";
export { automationInspectorReferenceOptions } from "./reference-options";
export type { InspectorWidgetModel } from "./widget-model";
