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
export type { InspectorHandlerScopes, InspectorPanelContext, InspectorScopedSelectors } from "./types";
export { inspectorEffectiveHandlers, type InspectorEffectiveHandler, type InspectorEffectiveHandlers } from "./effective-handlers";
export { EffectiveHandlersSection } from "./EffectiveHandlersSection";
export { automationInspectorReferenceOptions } from "./reference-options";
export type { InspectorWidgetModel } from "./widget-model";
