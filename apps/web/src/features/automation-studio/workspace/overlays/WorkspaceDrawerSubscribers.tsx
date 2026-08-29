"use client";

import type { ComponentType } from "react";
import { Drawer } from "../../../programs/shared-ui";
import {
  useAutomationOverlaySelection,
  type AutomationStudioOverlayStore
} from "./overlay-state-store";

export function HierarchyDrawerSubscriber(props: {
  Content: ComponentType;
  store: AutomationStudioOverlayStore;
}) {
  const request = useAutomationOverlaySelection(props.store, "drawer");
  if (!request || request.kind !== "hierarchy") return null;
  return (
    <Drawer
      closeOnEscape
      onClose={() => props.store.close("drawer", request.id)}
      side="left"
      title={request.title}
    >
      <props.Content />
    </Drawer>
  );
}

export function TimelineDrawerSubscriber(props: {
  Content: ComponentType;
  store: AutomationStudioOverlayStore;
}) {
  const request = useAutomationOverlaySelection(props.store, "drawer");
  if (!request || request.kind !== "timeline") return null;
  return (
    <Drawer
      className="automation-preview-sheet"
      closeOnEscape
      onClose={() => props.store.close("drawer", request.id)}
      side="right"
      title={request.title}
    >
      <props.Content />
    </Drawer>
  );
}
