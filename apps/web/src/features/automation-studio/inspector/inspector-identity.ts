import type { AutomationSelection } from "../shared/selection-contracts";
import type { InspectorIdentity } from "./types";

export function inspectorIdentity(selection: AutomationSelection | null, context: { flow?: any; node?: any; recording?: any; entry?: any; signal?: any }): InspectorIdentity | null {
  if (!selection) return null;
  const flowLabel = context.flow?.name ?? context.flow?.flowId;
  const labels: Partial<Record<AutomationSelection["kind"], string>> = {
    workspace: selection.id === "clients" ? "Connected Clients" : "Runs",
    flow: context.flow?.name ?? selection.id,
    policy: context.flow?.name ?? selection.id,
    node: context.node?.label ?? selection.id,
    "editor-node": selection.kind === "editor-node" ? selection.node.label : "",
    "editor-mode": selection.kind === "editor-mode" ? selection.label + " Mode" : "",
    recording: context.recording?.name ?? context.recording?.metadata?.name ?? selection.id,
    timeline: context.entry?.label ?? context.entry?.type ?? selection.id,
    signal: context.signal?.label ?? context.signal?.path ?? selection.id,
    state: selection.kind === "state" ? selection.factPath ?? selection.evidenceId ?? "State detail" : ""
  };
  const titles: Partial<Record<AutomationSelection["kind"], string>> = {
    workspace: "Workspace",
    flow: "Flow",
    policy: "Flow Graph",
    node: "Node",
    "editor-node": "Editor Node",
    "editor-mode": "Editor Mode",
    recording: "Recording",
    timeline: "Timeline Entry",
    signal: "Signal",
    state: "State Detail"
  };

  const label = String(labels[selection.kind] ?? selection.id);
  return {
    title: String(titles[selection.kind] ?? "Inspector"),
    label,
    id: selection.id,
    breadcrumb: [flowLabel, label].filter((value, index, values): value is string => typeof value === "string" && Boolean(value) && values.indexOf(value) === index)
  };
}