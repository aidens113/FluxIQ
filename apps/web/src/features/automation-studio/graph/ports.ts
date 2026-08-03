import type { Connection, Edge, Node } from "@xyflow/react";
import type { AutomationNodePort } from "fluxiq/automation-studio/nodes";

type AutomationPortNodeData = { inputs?: AutomationNodePort[]; outputs?: AutomationNodePort[] };

export function automationConnectionIsValid<T extends AutomationPortNodeData>(connection: Connection | Edge, nodes: Array<Node<T>>): boolean {
  if (!connection.source || !connection.target || connection.source === connection.target) return false;
  const source = nodes.find((node) => node.id === connection.source);
  const target = nodes.find((node) => node.id === connection.target);
  const sourcePort = (source?.data.outputs ?? []).find((port) => port.id === connection.sourceHandle);
  const targetPort = (target?.data.inputs ?? []).find((port) => port.id === connection.targetHandle);
  if (!sourcePort || !targetPort) return false;
  return automationPortTypesCompatible(sourcePort.valueType, targetPort.valueType);
}

export function automationPortTypesCompatible(sourceType: AutomationNodePort["valueType"], targetType: AutomationNodePort["valueType"]): boolean {
  if (sourceType === "any" || targetType === "any") return true;
  if (sourceType === targetType) return true;
  if (sourceType === "signal" && targetType === "boolean") return true;
  return false;
}

export type AutomationPortTone = "flow" | "success" | "warning" | "danger" | "boolean" | "number" | "text" | "object" | "signal" | "routine" | "neutral";

export function automationPortTone(port: AutomationNodePort, direction: "source" | "target"): AutomationPortTone {
  if (port.role === "success") return "success";
  if (port.role === "failure" || port.role === "error") return "danger";
  if (port.role === "branch") return "warning";
  if (port.role === "data") return "object";
  if (port.role === "control") return "flow";
  const semantic = `${port.id} ${port.label}`.toLowerCase();
  if (/\b(success|passed|approved|recovered|stable|done|next)\b/.test(semantic)) return "success";
  if (/\b(fail|failure|failed|rejected|timeout|error)\b/.test(semantic)) return "danger";
  if (/\b(branch|body|case|default|retry|recover|branches)\b/.test(semantic)) return "warning";
  if (/\b(value|result|choice|record|records|items|object|patch)\b/.test(semantic)) return "object";
  switch (port.valueType) {
    case "boolean": return "boolean";
    case "number": return "number";
    case "string": return "text";
    case "object":
    case "array": return "object";
    case "signal": return "signal";
    case "policy":
    case "routine": return "routine";
    case "any": return direction === "source" && automationPortIsRoute(port) ? "flow" : "neutral";
    default: return "neutral";
  }
}

export function automationPortColor(tone: AutomationPortTone): string {
  switch (tone) {
    case "success": return "#188038";
    case "warning": return "#b35c00";
    case "danger": return "#c5221f";
    case "boolean": return "#00897b";
    case "number": return "#5e35b1";
    case "text": return "#ad1457";
    case "object": return "#1565c0";
    case "signal": return "#ef6c00";
    case "routine": return "#6a1b9a";
    case "flow": return "#0972d3";
    default: return "#6b7785";
  }
}

export function automationPortCaption(port: AutomationNodePort, direction: "source" | "target"): string {
  const tone = automationPortTone(port, direction);
  if (port.role === "control") return "control";
  if (port.role === "success" || port.role === "failure" || port.role === "branch") return "route";
  if (port.role === "error") return "error";
  if (port.role === "data" && port.valueType === "any") return "data";
  if (port.valueType === "any") {
    return automationPortIsRoute(port) || tone === "success" || tone === "warning" || tone === "danger" ? "route" : "";
  }
  const suffix = port.multiple ? "[]" : "";
  switch (port.valueType) {
    case "boolean": return `condition${suffix}`;
    case "number": return `number${suffix}`;
    case "string": return `text${suffix}`;
    case "object": return `object${suffix}`;
    case "array": return `list${suffix}`;
    case "signal": return `signal${suffix}`;
    case "policy": return `policy${suffix}`;
    case "routine": return `routine${suffix}`;
    default: return `${port.valueType}${suffix}`;
  }
}

export function automationPortIsRoute(port: AutomationNodePort): boolean {
  if (port.role === "control" || port.role === "success" || port.role === "failure" || port.role === "branch") return true;
  return /\b(next|success|failure|failed|passed|approved|rejected|timeout|body|done|case|default|branch|branches|recovered)\b/.test(`${port.id} ${port.label}`.toLowerCase());
}

export function automationPortTitle(port: AutomationNodePort, direction: "source" | "target"): string {
  const caption = automationPortCaption(port, direction);
  const label = automationPortDisplayLabel(port);
  return caption ? `${label} - ${caption}` : label;
}

export function automationPortDisplayLabel(port: AutomationNodePort): string {
  if (port.id === "body" || port.label.toLowerCase() === "body") return "Repeat";
  return port.label;
}

export function automationPortIdFromLabel(label: unknown): string {
  const normalized = String(label ?? "next")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || "next";
}

export function automationPortLabelFromId(portId: string | null | undefined): string | null {
  if (!portId) return null;
  if (portId === "body") return "Repeat";
  return portId
    .split(/[-_]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ") || null;
}

export function uniqueAutomationPorts(ports: AutomationNodePort[]): AutomationNodePort[] {
  const counts = new Map<string, number>();
  return ports.map((port) => {
    const count = counts.get(port.id) ?? 0;
    counts.set(port.id, count + 1);
    return count === 0 ? port : { ...port, id: `${port.id}-${count + 1}` };
  });
}

export function formatAutomationPorts(ports: AutomationNodePort[] | undefined): string {
  if (!ports?.length) return "None";
  return ports.map((port) => {
    const caption = automationPortCaption(port, "source");
    const label = automationPortDisplayLabel(port);
    return caption ? `${label}: ${caption}` : label;
  }).join(", ");
}
