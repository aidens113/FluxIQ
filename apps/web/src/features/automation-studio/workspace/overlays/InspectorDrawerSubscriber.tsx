"use client";

import type { ComponentType } from "react";
import { Drawer } from "../../../programs/shared-ui";
import {
  useAutomationOverlaySelection,
  type AutomationStudioOverlayStore
} from "./overlay-state-store";

export function InspectorDrawerSubscriber(props: {
  Content: ComponentType;
  store: AutomationStudioOverlayStore;
}) {
  const request = useAutomationOverlaySelection(props.store, "inspectorDrawer");
  if (!request) return null;
  return (
    <Drawer
      closeOnEscape
      onClose={() => props.store.close("inspectorDrawer", request.id)}
      side="right"
      title={request.title}
    >
      <props.Content />
    </Drawer>
  );
}
