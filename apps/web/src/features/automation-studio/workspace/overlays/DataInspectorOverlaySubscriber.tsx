"use client";

import type { ComponentProps } from "react";
import { AutomationStudioDataInspector } from "../../development/DataInspector";
import type { DataInspectorOverlayRequest } from "./contracts";
import {
  useAutomationOverlaySelection,
  type AutomationStudioOverlayStore
} from "./overlay-state-store";

type InspectorProps = ComponentProps<typeof AutomationStudioDataInspector>;

export type DataInspectorOverlayBinding = {
  api: InspectorProps["api"];
  cacheStats: InspectorProps["cacheStats"];
};

export function DataInspectorOverlaySubscriber(
  props: DataInspectorOverlayBinding & { store: AutomationStudioOverlayStore }
) {
  const request = useAutomationOverlaySelection(props.store, "dataInspector");
  if (!request || process.env.NODE_ENV === "production") return null;
  return (
    <DataInspectorOverlaySurface
      api={props.api}
      cacheStats={props.cacheStats}
      onClose={() => props.store.close("dataInspector", request.id)}
      request={request}
    />
  );
}

export function DataInspectorOverlaySurface(
  props: DataInspectorOverlayBinding & {
    onClose(): void;
    request: DataInspectorOverlayRequest;
  }
) {
  return (
    <AutomationStudioDataInspector
      activeProjectId={props.request.activeProjectId}
      api={props.api}
      cacheStats={props.cacheStats}
      onClose={props.onClose}
    />
  );
}
