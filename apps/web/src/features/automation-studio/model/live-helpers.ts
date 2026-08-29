import type { NodeStatePhase } from "fluxiq/automation-studio";
import { automationStudioUiRequest, type AutomationStudioUiRequest } from "../data-request-policy";
import type { AutomationSelection } from "../shared/selection-contracts";
import type { AutomationViewInstance } from "../views/view-types";

export type AutomationFlowPresetValue = "blank" | "deterministic" | "recorded" | "integration" | "scheduled" | "api-endpoint" | "reusable";

export const AUTOMATION_STUDIO_PROJECT_OPEN_DETAIL_ENDPOINT_DENYLIST = [
  "get-recording",
  "get-runtime-session",
  "get-runtime-session-action-log",
  "get-normalized-timeline",
  "get-flow",
  "get-flow-subflow",
  "get-flow-instruction-set",
  "get-flow-change-proposal",
  "get-flow-run-detail",
  "get-flow-adaptation",
  "list-runtime-session-events"
] as const;

export function automationStudioProjectOpenRequests(projectId: string): [AutomationStudioUiRequest] {
  return [automationStudioUiRequest("catalog", "get-project-hierarchy", { projectId })];
}

export function automationStudioRuntimeSummaryRequests(projectId: string): [AutomationStudioUiRequest] {
  return [automationStudioUiRequest("summary", "get-project-workspace-summary", { projectId })];
}

export function shortAutomationId(value: string): string {
  return value.length > 18 ? value.slice(0, 8) + "..." + value.slice(-6) : value;
}

export function automationFlowPreset(flow: any, preset: AutomationFlowPresetValue) {
  const start = { id: "start", definitionId: "builtin.control.start", position: { x: 80, y: 140 } };
  const end = { id: "end", definitionId: "builtin.control.end", position: { x: 500, y: 140 } };
  const base = { ...flow, origin: preset === "recorded" ? "recorded" : "manual", metadata: { ...(flow.metadata ?? {}), preset } };
  if (preset === "blank") return base;
  if (preset === "recorded") return base;
  if (preset === "scheduled") return { ...base, nodes: [start, { id: "wait", definitionId: "builtin.timing.wait", position: { x: 290, y: 140 } }, end], edges: [{ id: "start.wait", sourceNodeId: "start", sourcePortId: "success", targetNodeId: "wait", targetPortId: "in" }, { id: "wait.end", sourceNodeId: "wait", sourcePortId: "success", targetNodeId: "end", targetPortId: "in" }], metadata: { ...base.metadata, trigger: "schedule" } };
  if (preset === "api-endpoint") return { ...base, nodes: [start, end], edges: [{ id: "start.end", sourceNodeId: "start", sourcePortId: "success", targetNodeId: "end", targetPortId: "in" }], interface: { inputs: [{ id: "request", name: "Request", valueType: { kind: "json" } }], outputs: [{ id: "response", name: "Response", valueType: { kind: "json" } }] }, metadata: { ...base.metadata, trigger: "api" } };
  if (preset === "reusable") return { ...base, nodes: [start, end], edges: [{ id: "start.end", sourceNodeId: "start", sourcePortId: "success", targetNodeId: "end", targetPortId: "in" }], publication: { status: "publishable" } };
  return { ...base, nodes: [start, end], edges: [{ id: "start.end", sourceNodeId: "start", sourcePortId: "success", targetNodeId: "end", targetPortId: "in" }], metadata: { ...base.metadata, ...(preset === "integration" ? { integration: true } : {}) } };
}



export function isAutomationSelection(value: unknown): value is AutomationSelection {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const selection = value as { kind?: unknown; id?: unknown };
  return typeof selection.kind === "string" && typeof selection.id === "string";
}

export function parsePaneTabDragPayload(value: string): { paneId: string; viewId: string } | null {
  try {
    const parsed = JSON.parse(value) as { paneId?: unknown; viewId?: unknown };
    return typeof parsed.paneId === "string" && typeof parsed.viewId === "string"
      ? { paneId: parsed.paneId, viewId: parsed.viewId }
      : null;
  } catch {
    return null;
  }
}

export function stateSelectionId(parts: { nodeId?: string; flowId?: string; proposalId?: string; timelineEntryId?: string; stateSnapshotId?: string }): string {
  if (parts.proposalId && parts.nodeId) return `state:${parts.proposalId}:${parts.nodeId}`;
  if (parts.flowId && parts.nodeId) return `state:${parts.flowId}:${parts.nodeId}`;
  if (parts.stateSnapshotId) return `state:snapshot:${parts.stateSnapshotId}`;
  if (parts.timelineEntryId) return `state:timeline:${parts.timelineEntryId}`;
  return `state:${parts.nodeId ?? "workspace"}`;
}

export function compactStateSelectionId(value: { nodeId?: string | undefined; flowId?: string | undefined; proposalId?: string | undefined; timelineEntryId?: string | undefined; stateSnapshotId?: string | undefined }): { nodeId?: string; flowId?: string; proposalId?: string; timelineEntryId?: string; stateSnapshotId?: string } {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as { nodeId?: string; flowId?: string; proposalId?: string; timelineEntryId?: string; stateSnapshotId?: string };
}

export function compactStateSelection(value: { kind: "state"; id: string; nodeId?: string | undefined; sourceId?: string | undefined; phase?: NodeStatePhase | undefined; evidenceId?: string | undefined; factPath?: string | undefined; recordingId?: string | undefined; proposalId?: string | undefined; timelineEntryId?: string | undefined; stateSnapshotId?: string | undefined; stateRef?: string | undefined }): AutomationSelection {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as AutomationSelection;
}

export function recordingIdFromStateSourceId(sourceId: string | undefined): string | undefined {
  const match = /^observed:([^:]+):/.exec(sourceId ?? "");
  return match?.[1];
}

export function automationViewBodyClassName(view: AutomationViewInstance): string | undefined {
  if (view.type === "design") return "graph-body";
  if (view.type === "recordings") return "timeline-body";
  return undefined;
}
export function replaceAutomationStudioBrowserUrl(pathname: string, params: URLSearchParams): void {
  if (typeof window === "undefined") return;
  const query = params.toString();
  const hash = window.location.hash ?? "";
  const nextUrl = (query ? pathname + "?" + query : pathname) + hash;
  const currentUrl = window.location.pathname + window.location.search + hash;
  if (currentUrl === nextUrl) return;
  window.history.replaceState(window.history.state, "", nextUrl);
}

export function automationStudioCurrentSearchParams(searchParams?: { toString(): string }): URLSearchParams {
  return new URLSearchParams(typeof window === "undefined" ? searchParams?.toString() ?? "" : window.location.search);
}
export function stateOpenNodeMetadata(nodeId: string | undefined, selectedNode: any): Record<string, unknown> | null {
  if (!selectedNode || typeof selectedNode !== "object" || Array.isArray(selectedNode)) return null;
  if (nodeId && typeof selectedNode.id === "string" && selectedNode.id !== nodeId) return null;
  const metadata = selectedNode.metadata;
  return metadata && typeof metadata === "object" && !Array.isArray(metadata) ? metadata as Record<string, unknown> : null;
}

export function yesNo(value: unknown): string {
  return value ? "Yes" : "No";
}

export function formatTime(value: unknown): string {
  return typeof value === "number" && value > 0 ? new Date(value).toLocaleString() : "-";
}

export function isSensitiveDatabaseStore(kind: string): boolean {
  return kind.trim().toLowerCase() === "identity.users";
}

export function sensitiveStoreKey(kind: string, database: string): string {
  return `${database}:${kind.trim().toLowerCase()}`;
}


export function formatDuration(value: unknown): string {
  if (typeof value !== "number" || value <= 0) return "-";
  const minutes = Math.round(value / 60_000);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} hr`;
  return `${Math.round(hours / 24)} days`;
}

export function formatCountdown(task: any, nowMs: number, schedulerRunning = true): string {
  if (!task?.enabled) return "Stopped";
  if (!schedulerRunning) return "Paused";
  if (!task.nextRunAtMs) return "Manual";
  const remainingSeconds = Math.max(0, Math.ceil((Number(task.nextRunAtMs) - nowMs) / 1000));
  if (remainingSeconds <= 0) return "Due now";
  const days = Math.floor(remainingSeconds / 86_400);
  const hours = Math.floor((remainingSeconds % 86_400) / 3_600);
  const minutes = Math.floor((remainingSeconds % 3_600) / 60);
  const seconds = remainingSeconds % 60;
  if (days > 0) return `${days}d ${hours}h ${minutes}m ${seconds}s`;
  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

export function scheduleProgress(task: any, nowMs = Date.now()): string {
  if (!task?.intervalMs || !task.nextRunAtMs) return "0%";
  const remaining = Math.max(0, Number(task.nextRunAtMs) - nowMs);
  const elapsedRatio = 1 - remaining / Number(task.intervalMs);
  return `${Math.max(4, Math.min(100, elapsedRatio * 100))}%`;
}

export function digits(value: string): string {
  return value.replace(/\D/g, "");
}

export function emptyCredentialEdit(kind: "password" | "pin") {
  return {
    kind,
    value: "",
    confirm: "",
    authorizationPassword: "",
    authorizationPin: "",
    authorizationTotp: ""
  };
}

export function csv(value: string): string[] {
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

export function sameStringList(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((item, index) => item === right[index]);
}

export function automationSelectionSame(left: AutomationSelection | null, right: AutomationSelection): boolean {
  if (!left || left.kind !== right.kind) return false;
  const leftRecord = left as unknown as Record<string, unknown>;
  const rightRecord = right as unknown as Record<string, unknown>;
  const leftKeys = Object.keys(leftRecord);
  const rightKeys = Object.keys(rightRecord);
  return leftKeys.length === rightKeys.length && leftKeys.every((key) => leftRecord[key] === rightRecord[key]);
}
