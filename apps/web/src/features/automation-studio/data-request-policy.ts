import { automationStudioViewId } from "./views/view-registry";
import type { JsonObject } from "../programs/program-api";

export type AutomationStudioUiRequestIntent = "catalog" | "summary" | "detail" | "mutation";
export type AutomationStudioUiRequest = { endpoint: string; payload: JsonObject; intent: AutomationStudioUiRequestIntent };

export const AUTOMATION_STUDIO_FULL_DOCUMENT_ENDPOINTS = Object.freeze([
  "snapshot",
  "get-project-artifact",
  "get-recording",
  "get-runtime-session",
  "get-normalized-timeline",
  "get-flow",
  "get-flow-subflow",
  "get-flow-instruction-set",
  "get-flow-change-proposal",
  "get-flow-run-detail",
  "get-flow-adaptation"
] as const);

export const AUTOMATION_STUDIO_BROWSER_BLOCKED_LEGACY_ENDPOINTS = Object.freeze([
  "snapshot",
  "list-project-artifacts",
  "list-flows",
  "get-flow",
  "save-flow",
  "save-project-hierarchy",
  "repair-recording-state-index"
] as const);

const fullDocumentEndpoints = new Set<string>(AUTOMATION_STUDIO_FULL_DOCUMENT_ENDPOINTS);
const blockedLegacyEndpoints = new Set<string>(AUTOMATION_STUDIO_BROWSER_BLOCKED_LEGACY_ENDPOINTS);

export function automationStudioUiRequest(
  intent: AutomationStudioUiRequestIntent,
  endpoint: string,
  payload: JsonObject
): AutomationStudioUiRequest {
  if ((intent === "catalog" || intent === "summary") && fullDocumentEndpoints.has(endpoint)) {
    throw new Error(`Automation Studio ${intent} requests cannot use full-document endpoint ${endpoint}.`);
  }
  return { endpoint, payload, intent };
}

export function automationStudioRequestIsOrdinary(request: AutomationStudioUiRequest): boolean {
  return request.intent === "catalog" || request.intent === "summary";
}

export function assertAutomationStudioBrowserEndpointAllowed(endpoint: string): void {
  if (blockedLegacyEndpoints.has(endpoint)) {
    throw new Error(`Automation Studio browser endpoint ${endpoint} is retired for v2 cutover; use bounded v2 list/detail/mutation APIs.`);
  }
}

export type AutomationStudioPreloadTier = 0 | 1 | 2 | 3;
export type AutomationStudioGraphViewportBounds = { minX: number; minY: number; maxX: number; maxY: number };
export type AutomationStudioLazyPreloadPlanInput = {
  projectId: string;
  activeFlowId?: string | null;
  activeSubflowId?: string | null;
  activeRunId?: string | null;
  activeViewId?: string | null;
  openViewIds?: readonly string[];
  graphViewportBounds?: AutomationStudioGraphViewportBounds | null;
  maxTier?: AutomationStudioPreloadTier;
};
export type AutomationStudioLazyPreloadTask = {
  id: string;
  tier: AutomationStudioPreloadTier;
  request: AutomationStudioUiRequest;
  dedupeKey: string;
  reason: string;
};
export type AutomationStudioLazyPreloadPlan = {
  projectId: string;
  tasks: AutomationStudioLazyPreloadTask[];
  maxConcurrency: 1 | 2;
  sliceBudgetMs: number;
  idleTimeoutMs: number;
};

export function automationStudioLazyPreloadPlan(input: AutomationStudioLazyPreloadPlanInput): AutomationStudioLazyPreloadPlan {
  const projectId = requiredProjectId(input.projectId);
  const maxTier = input.maxTier ?? 3;
  const flowId = optionalId(input.activeFlowId);
  const runId = optionalId(input.activeRunId);
  const viewIds = new Set([optionalId(input.activeViewId), ...(input.openViewIds ?? []).map(optionalId)].filter((value): value is string => Boolean(value)));
  const tasks: AutomationStudioLazyPreloadTask[] = [];
  const seen = new Set<string>();
  const add = (tier: AutomationStudioPreloadTier, intent: AutomationStudioUiRequestIntent, endpoint: string, payload: JsonObject, reason: string) => {
    if (tier > maxTier) return;
    const request = automationStudioUiRequest(intent, endpoint, payload);
    assertAutomationStudioBrowserEndpointAllowed(endpoint);
    const dedupeKey = `${endpoint}:${stableStringify(payload)}`;
    if (seen.has(dedupeKey)) return;
    seen.add(dedupeKey);
    tasks.push({ id: `preload:${tier}:${dedupeKey}`, tier, request, dedupeKey, reason });
  };

  add(0, "catalog", "get-project-hierarchy", { projectId }, "Hydrate the project shell and exact hierarchy state first.");
  add(0, "summary", "get-project-workspace-summary", { projectId }, "Hydrate bounded project counters without reading full documents.");

  if (flowId) {
    add(1, "summary", "list-flow-subflows", { projectId, flowId, limit: 25, offset: 0 }, "Warm the active Flow's first subflow page.");
    add(1, "summary", "list-flow-instructions", { projectId, flowId, limit: 25, offset: 0 }, "Warm the active Flow's instruction summary page.");
    add(1, "summary", "list-flow-runs", { projectId, flowId, limit: 25, offset: 0 }, "Warm the active Flow's latest run summary page.");
    add(1, "detail", "get-flow-router", { projectId, flowId }, "Warm the active Flow router without loading graph documents.");
    if (input.graphViewportBounds) add(1, "detail", "get-graph-viewport", { projectId, flowId, bounds: input.graphViewportBounds, limit: 200 }, "Warm only the visible graph viewport.");
  }

  if (flowId && (viewIds.has(automationStudioViewId.adaptations) || viewIds.has("flow-adaptations"))) add(2, "summary", "list-flow-adaptations", { projectId, flowId, limit: 25, offset: 0 }, "Warm the open adaptations inbox page.");
  if (flowId && viewIds.has(automationStudioViewId.settings)) add(2, "detail", "get-flow-metadata-detail", { projectId, flowId }, "Warm editable Flow settings metadata.");
  if (runId) {
    add(2, "detail", "list-flow-run-events", { projectId, runId, afterSequence: 0, limit: 50 }, "Warm the first runtime event page for the selected run.");
    add(3, "detail", "list-flow-run-actions", { projectId, runId, limit: 50, offset: 0 }, "Warm the selected run action page after the event log is available.");
  }
  if (flowId) add(3, "summary", "list-flow-subflows", { projectId, flowId, limit: 25, offset: 25 }, "Warm the next subflow page only after active-view work is done.");

  return { projectId, tasks, maxConcurrency: 1, sliceBudgetMs: 8, idleTimeoutMs: 1_500 };
}

function requiredProjectId(value: string): string {
  const projectId = value.trim();
  if (!projectId) throw new Error("Automation Studio preload requires a project ID.");
  return projectId;
}

function optionalId(value: string | null | undefined): string | null {
  const id = value?.trim();
  return id ? id : null;
}

function stableStringify(value: unknown): string {
  if (value === undefined) return "null";
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(",")}}`;
}
