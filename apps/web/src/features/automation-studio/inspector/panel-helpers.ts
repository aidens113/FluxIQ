import type { AutomationSelection } from "../shared/selection-contracts";
import type { InspectorRow } from "./types";

export function listRows(items: string[]): InspectorRow[] {
  return items.length ? items.map((item, index) => [String(index + 1), item]) : [["Items", "-"]];
}

export function adaptationChangeRows(value: any): InspectorRow[] {
  if (!value || typeof value !== "object") return [];
  return [
    ["Confidence", String(value.confidence ?? "-")],
    ["Event", String(value.label ?? "-")],
    ["Transition", String(value.transition ?? "-")],
    ["Occurrences", Number(value.occurrenceCount ?? 1) > 1 ? `${value.occurrenceCount} grouped occurrences` : "1 occurrence"],
    ["Description", String(value.description ?? "-")]
  ];
}

export function adaptationChangeArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String).filter(Boolean) : [];
}

export function adaptationChangeEvidenceRows(value: unknown): InspectorRow[] {
  if (!Array.isArray(value)) return [];
  return value.map((signal: any) => [String(signal.title ?? signal.id ?? "Evidence"), String(signal.relation ?? "-")]);
}

export function callFlowInspectorRows(value: any): InspectorRow[] {
  const target = value?.target ?? {};
  return [["Flow", String(target.flowId ?? "-")], ["Version", String(target.version ?? "-")], ["Scope", target.scope?.kind === "domain" ? `domain:${target.scope.domainId}` : String(target.scope?.kind ?? "-")], ["Inputs", String(value?.inputBindings?.length ?? 0)], ["Outputs", String(value?.outputBindings?.length ?? 0)], ["Error routes", String(value?.errorBindings?.length ?? 0)]];
}

export function flowSourcePath(flow: any): string {
  if (flow?.source?.mode === "code" && flow.source.moduleId) return `source/${flow.source.moduleId}`;
  return flow?.metadata?.generatedSource?.relativePath ?? (flow?.flowId ? `source/flows/${flow.flowId}.flow.ts` : "-");
}

export function nodeConditionSections(node: any) {
  return [
    { title: "General", rows: [["Node", node.label], ["ID", node.id], ["Actions", (node.actions ?? []).map((action: any) => action.actionType).join(", ")], ["Recovery", node.recovery?.strategy ?? "-"]] as InspectorRow[] },
    { title: "Conditions", rows: [["Eligibility", inspectorConditionSummary(node.eligibility)], ["Readiness", inspectorConditionSummary(node.readinessConditions)], ["Success", inspectorConditionSummary(node.successConditions)]] as InspectorRow[] },
    { title: "Timing and Retries", rows: [["Timeout", node.timeout?.timeoutMs ? `${node.timeout.timeoutMs} ms` : "Default"], ["Retry", node.retry?.strategy ?? "Default"], ["Recovery", node.recovery?.strategy ?? "-"]] as InspectorRow[] }
  ];
}

export function inspectorPortSummary(ports: Array<{ id: string; label: string; role?: string; valueType?: string; multiple?: boolean }> | undefined): string {
  if (!ports?.length) return "None";
  return ports.map((port) => {
    const route = port.role === "control" || ["success", "failure", "branch"].includes(port.role ?? "");
    const caption = route ? "route" : port.role === "error" ? "error" : port.valueType && port.valueType !== "any" ? `${port.valueType}${port.multiple ? "[]" : ""}` : "";
    const label = port.id === "body" || port.label.toLowerCase() === "body" ? "Repeat" : port.label;
    return caption ? `${label}: ${caption}` : label;
  }).join(", ");
}

export function inspectorStateNodeId(selection: AutomationSelection | null, node: any): string {
  if (selection?.kind === "editor-node" || selection?.kind === "node") return selection.id;
  if (selection?.kind === "state" && selection.nodeId) return selection.nodeId;
  return typeof node?.id === "string" ? node.id : "";
}

function inspectorConditionSummary(group: any): string {
  if (!group) return "-";
  const conditions = group.conditions ?? [];
  if (!conditions.length) return `${group.type ?? "condition"}: empty`;
  return `${group.type}: ${conditions.map((condition: any) => condition.signalPath ? `${condition.signalPath} ${condition.operator}` : inspectorConditionSummary(condition)).join("; ")}`;
}