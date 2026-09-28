import { memo, type ComponentType } from "react";
import type { OverlayCommandDispatcher } from "./atomic-command";
import {
  DataInspectorOverlaySubscriber,
  type DataInspectorOverlayBinding
} from "./DataInspectorOverlaySubscriber";
import { InspectorDrawerSubscriber } from "./InspectorDrawerSubscriber";
import { LayoutPickerOverlaySubscriber } from "./LayoutPickerOverlaySubscriber";
import { PreferencesOverlaySubscriber } from "./PreferencesOverlaySubscriber";
import { ViewAdderOverlaySubscriber } from "./ViewAdderOverlaySubscriber";
import {
  HierarchyDrawerSubscriber,
  TimelineDrawerSubscriber
} from "./WorkspaceDrawerSubscribers";
import type {
  LayoutPickerOverlayCommand,
  PreferencesOverlayCommand,
  ViewAdderOverlayCommand
} from "./contracts";
import type { AutomationStudioOverlayStore } from "./overlay-state-store";

export type AutomationStudioOverlayDispatchers = {
  layout?: OverlayCommandDispatcher<LayoutPickerOverlayCommand>;
  preferences?: OverlayCommandDispatcher<PreferencesOverlayCommand>;
  view?: OverlayCommandDispatcher<ViewAdderOverlayCommand>;
};

export type AutomationStudioOverlaySurfaces = {
  HierarchyDrawerContent?: ComponentType;
  InspectorDrawerContent?: ComponentType;
  TimelineDrawerContent?: ComponentType;
};

export type AutomationStudioOverlayBindings = {
  dataInspector?: DataInspectorOverlayBinding;
  dispatchers: AutomationStudioOverlayDispatchers;
  store: AutomationStudioOverlayStore;
  surfaces?: AutomationStudioOverlaySurfaces;
};

export const AutomationStudioOverlays = memo(function AutomationStudioOverlays(
  props: AutomationStudioOverlayBindings
) {
  const { dataInspector, dispatchers, store, surfaces } = props;
  const HierarchyContent = surfaces?.HierarchyDrawerContent;
  const InspectorContent = surfaces?.InspectorDrawerContent;
  const TimelineContent = surfaces?.TimelineDrawerContent;

  return (
    <>
      {dispatchers.preferences ? <PreferencesOverlaySubscriber dispatch={dispatchers.preferences} store={store} /> : null}
      {dispatchers.view ? <ViewAdderOverlaySubscriber dispatch={dispatchers.view} store={store} /> : null}
      {dispatchers.layout ? <LayoutPickerOverlaySubscriber dispatch={dispatchers.layout} store={store} /> : null}
      {dataInspector ? <DataInspectorOverlaySubscriber {...dataInspector} store={store} /> : null}
      {InspectorContent ? <InspectorDrawerSubscriber Content={InspectorContent} store={store} /> : null}
      {HierarchyContent ? <HierarchyDrawerSubscriber Content={HierarchyContent} store={store} /> : null}
      {TimelineContent ? <TimelineDrawerSubscriber Content={TimelineContent} store={store} /> : null}
    </>
  );
});
