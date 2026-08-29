"use client";

import type { OverlayCommandDispatcher } from "./atomic-command";
import type { HierarchyOverlayCommand } from "./contracts";
import { HierarchyCreateOverlaySurface } from "./HierarchyCreateOverlaySurface";
import { HierarchyDeleteOverlaySurface } from "./HierarchyDeleteOverlaySurface";
import { useAutomationOverlaySelection, type AutomationStudioOverlayStore } from "./overlay-state-store";

export function HierarchyActionOverlaySubscriber(props: {
  dispatch: OverlayCommandDispatcher<HierarchyOverlayCommand>;
  store: AutomationStudioOverlayStore;
}) {
  const request = useAutomationOverlaySelection(props.store, "hierarchy");
  if (!request) return null;
  const close = () => props.store.close("hierarchy", request.id);
  if (request.kind === "create") {
    return (
      <HierarchyCreateOverlaySurface
        dispatch={props.dispatch}
        key={request.id}
        onClose={close}
        request={request}
      />
    );
  }
  return (
    <HierarchyDeleteOverlaySurface
      dispatch={props.dispatch}
      key={request.id}
      onClose={close}
      request={request}
    />
  );
}