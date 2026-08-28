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
