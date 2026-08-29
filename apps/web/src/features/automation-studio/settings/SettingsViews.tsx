"use client";

import { FlowSettingsView } from "./FlowSettingsView";
import { SubflowSettingsView, subflowSettingsOwnership } from "./SubflowSettingsView";

export * from "./settings-model";
export * from "./FlowSettingsView";
export * from "./SubflowSettingsView";

export function SettingsView(props: { projectId: string | null; flow: any }) {
  const ownership = subflowSettingsOwnership(props.flow);
  return ownership
    ? <SubflowSettingsView flow={props.flow} ownership={ownership} projectId={props.projectId} />
    : <FlowSettingsView flow={props.flow} projectId={props.projectId} />;
}
