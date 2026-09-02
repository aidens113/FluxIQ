"use client";

import { useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { assertAutomationStudioBrowserEndpointAllowed } from "../automation-studio/data-request-policy";
import { recordAutomationStudioHierarchySaveRequest, recordAutomationStudioRequestLifecycle } from "./ui-performance";
import { evaluateRequestBudget } from "./ui-performance-budgets";
import { requestProgramAuthentication } from "./program-auth-recovery";
import { coordinateProgramRequest, programRequestPolicy, type ProgramRequestPolicy } from "./program-request-coordinator";

export type ApiFieldErrors = Record<string, string | string[]>;
export type ApiResponse<T = unknown> = {
  ok: boolean;
  payload?: T;
  error?: string;
  aborted?: boolean;
  status?: number;
  code?: string;
  fieldErrors?: ApiFieldErrors;
  retryable?: boolean;
  requestId?: string;
  conflictRevision?: string | number;
};
export type ProgramApiRequestOptions = { signal?: AbortSignal; policy?: Partial<ProgramRequestPolicy> };
export type JsonObject = Record<string, unknown>;
export type ProgramApiMetric = {
  programId: string;
  endpoint: string;
  method: "GET" | "POST";
  elapsedMs: number;
  responseBytes: number;
  classification: "summary" | "detail" | "mutation" | "other";
  ok: boolean;
};
export type ProgramApiRequestMetric = {
  requestId: number;
  programId: string;
  endpoint: string;
  method: "GET" | "POST";
  phase: "started" | "finished";
  startedAt: number;
  elapsedMs?: number;
  ok?: boolean;
  aborted?: boolean;
};

let programApiRequestSequence = 0;

export function estimateProgramApiPayloadBytes(value: unknown): number {
  return estimateProgramApiPayloadShapeBytes(value);
}

function estimateProgramApiPayloadShapeBytes(value: unknown, depth = 0): number {
  if (value == null) return 0;
  if (typeof value === "string") return value.length * 2;
  if (typeof value === "number" || typeof value === "boolean") return 8;
  if (typeof value === "bigint") return 16;
  if (typeof value !== "object") return 32;
  if (depth >= 3) return 96;
  if (Array.isArray(value)) {
    const sample = value.slice(0, 25);
    const sampledBytes = sample.reduce((total, item) => total + estimateProgramApiPayloadShapeBytes(item, depth + 1), 0);
    const average = sample.length ? sampledBytes / sample.length : 0;
    return Math.round(24 + value.length * 8 + average * value.length);
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record);
  const sampledKeys = keys.slice(0, 50);
  const sampledBytes = sampledKeys.reduce((total, key) => total + key.length * 2 + estimateProgramApiPayloadShapeBytes(record[key], depth + 1), 0);
  const average = sampledKeys.length ? sampledBytes / sampledKeys.length : 0;
  return Math.round(32 + keys.length * 16 + average * keys.length);
}

export function classifyProgramApiEndpoint(endpoint: string, payload?: JsonObject): ProgramApiMetric["classification"] {
  if (endpoint === "save-project-ui-cache" || endpoint === "delete-project-ui-cache") return "other";
  if (/^(append|apply|approve|create|deprecate|delete|finalize|generate|mine|normalize|propose|publish|reject|repair|reorder|review|run|save|set|start|stop|update)-/.test(endpoint)) return "mutation";
  if (endpoint.startsWith("get-") || endpoint.includes("-detail") || endpoint.endsWith("-detail")) return "detail";
  if (endpoint.startsWith("list-") || endpoint.includes("summary") || endpoint.includes("summaries") || payload?.summaries === true) return "summary";
  return "other";
}

export function programApiMutationInvalidation(endpoint: string, payload?: JsonObject): { cacheScopes: string[]; resourceIds: string[] } {
  const projectId = typeof payload?.projectId === "string" ? payload.projectId : undefined;
  const resourceIds = [
    typeof payload?.flowId === "string" ? payload.flowId : undefined,
    nestedString(payload?.flow, "flowId"),
    typeof payload?.recordingId === "string" ? payload.recordingId : undefined,
    ...stringArray(payload?.recordingIds),
    typeof payload?.runId === "string" ? payload.runId : undefined,
    typeof payload?.adaptationId === "string" ? payload.adaptationId : undefined,
    typeof payload?.subflowId === "string" ? payload.subflowId : undefined,
    typeof payload?.instructionId === "string" ? payload.instructionId : undefined,
    typeof payload?.proposalId === "string" ? payload.proposalId : undefined,
    ...stringArray(payload?.proposalIds),
    typeof payload?.artifactId === "string" ? payload.artifactId : undefined,
    typeof payload?.categoryId === "string" ? payload.categoryId : undefined,
    typeof payload?.routeId === "string" ? payload.routeId : undefined,
    typeof payload?.groupId === "string" ? payload.groupId : undefined
  ].filter((value): value is string => Boolean(value));
  const uniqueResourceIds = [...new Set(resourceIds)];
  if (!projectId || !uniqueResourceIds.length) return { cacheScopes: [], resourceIds: uniqueResourceIds };
  if (endpoint.includes("recording") || endpoint.includes("timeline") || endpoint.includes("normalization")) return { cacheScopes: ["recording", "timeline", "summary"], resourceIds: uniqueResourceIds };
  if (endpoint.includes("runtime") || endpoint.startsWith("run-") || endpoint.includes("run-")) return { cacheScopes: ["summary"], resourceIds: uniqueResourceIds };
  if (endpoint.includes("adaptation") || endpoint.includes("proposal")) return { cacheScopes: ["proposal", "summary"], resourceIds: uniqueResourceIds };
  if (endpoint.includes("subflow")) return { cacheScopes: ["flow", "subflow", "summary", "flow-metadata"], resourceIds: uniqueResourceIds };
  if (endpoint.includes("flow") || endpoint.includes("route") || endpoint.includes("instruction")) return { cacheScopes: ["flow", "subflow", "summary", "flow-metadata"], resourceIds: uniqueResourceIds };
  return { cacheScopes: ["summary"], resourceIds: uniqueResourceIds };
}

function nestedString(value: unknown, key: string): string | undefined {
  return value && typeof value === "object" && typeof (value as Record<string, unknown>)[key] === "string"
    ? (value as Record<string, string>)[key]
    : undefined;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.length > 0) : [];
}

export function useProgramApi(programId: string) {
  const searchParams = useSearchParams();
  const domainId = searchParams.get("domainId");
  return useMemo(() => {
    const endpointUrl = (endpoint: string) => {
      if (programId === "automation-studio") assertAutomationStudioBrowserEndpointAllowed(endpoint);
      const query = domainId ? `?domainId=${encodeURIComponent(domainId)}` : "";
      return `/api/programs/${programId}/${endpoint}${query}`;
    };
    const emitMetric = (metric: ProgramApiMetric) => {
      if (process.env.NODE_ENV === "production" || typeof window === "undefined") return;
      window.dispatchEvent(new CustomEvent("program-api:metric", { detail: metric }));
      for (const violation of evaluateRequestBudget(metric)) {
        window.dispatchEvent(new CustomEvent("ui-performance:budget-violation", { detail: violation }));
      }
    };
    const emitMutation = (endpoint: string, payload: JsonObject | undefined) => {
      if (typeof window === "undefined" || classifyProgramApiEndpoint(endpoint, payload) !== "mutation") return;
      const invalidation = programApiMutationInvalidation(endpoint, payload);
      window.dispatchEvent(new CustomEvent("program-api:mutation", {
        detail: { programId, endpoint, projectId: typeof payload?.projectId === "string" ? payload.projectId : undefined, ...invalidation }
      }));
    };
    const readResponse = async <T,>(
      endpoint: string,
      method: "GET" | "POST",
      payload: JsonObject | undefined,
      request: () => Promise<Response>
    ): Promise<ApiResponse<T>> => {
      const startedAt = performance.now();
      const requestId = ++programApiRequestSequence;
      emitRequest({ requestId, programId, endpoint, method, phase: "started", startedAt });
      try {
        let response = await request();
        if (response.status === 401 && await requestProgramAuthentication()) response = await request();
        const result = await response.json().catch(() => undefined) as ApiResponse<T> | undefined;
        const normalized = normalizeProgramApiResponse(result, response);
        const metric = {
          programId,
          endpoint,
          method,
          elapsedMs: performance.now() - startedAt,
          responseBytes: estimateProgramApiPayloadBytes(normalized),
          classification: classifyProgramApiEndpoint(endpoint, payload),
          ok: normalized.ok
        } satisfies ProgramApiMetric;
        emitMetric(metric);
        emitRequest({ requestId, programId, endpoint, method, phase: "finished", startedAt, elapsedMs: metric.elapsedMs, ok: metric.ok });
        if (normalized.ok) emitMutation(endpoint, payload);
        return normalized;
      } catch (error) {
        const aborted = error instanceof DOMException && error.name === "AbortError";
        const metric = {
          programId,
          endpoint,
          method,
          elapsedMs: performance.now() - startedAt,
          responseBytes: 0,
          classification: classifyProgramApiEndpoint(endpoint, payload),
          ok: false
        } satisfies ProgramApiMetric;
        emitMetric(metric);
        emitRequest({ requestId, programId, endpoint, method, phase: "finished", startedAt, elapsedMs: metric.elapsedMs, ok: false, aborted });
        return aborted
          ? { ok: false, aborted: true, status: 0, code: "request_aborted", retryable: false, error: "Program request was cancelled." }
          : { ok: false, status: 0, code: "request_failed", retryable: true, error: "Program request could not be completed." };
      }
    };
    return {
      async get<T = unknown>(endpoint: string, options: ProgramApiRequestOptions = {}): Promise<ApiResponse<T>> {
        const url = endpointUrl(endpoint);
        return coordinateProgramRequest({
          key: `GET:${url}`,
          policy: { ...programRequestPolicy(programId, endpoint, "GET"), ...options.policy },
          ...(options.signal ? { signal: options.signal } : {}),
          execute: (signal) => readResponse<T>(endpoint, "GET", undefined, () => fetch(url, { cache: "no-store", signal }))
        });
      },
      async post<T = unknown>(endpoint: string, payload: JsonObject, options: ProgramApiRequestOptions = {}): Promise<ApiResponse<T>> {
        const url = endpointUrl(endpoint);
        const policy = { ...programRequestPolicy(programId, endpoint, "POST"), ...options.policy };
        return coordinateProgramRequest({
          key: policy.deduplicate ? `POST:${url}:${stableProgramRequestPayloadKey(payload)}` : `POST:${url}:${++programApiRequestSequence}`,
          policy,
          ...(options.signal ? { signal: options.signal } : {}),
          execute: (signal) => readResponse<T>(endpoint, "POST", payload, () => fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload), signal }))
        });
      }
    };
  }, [programId, domainId]);
}

function stableProgramRequestPayloadKey(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "undefined";
  if (Array.isArray(value)) return `[${value.map(stableProgramRequestPayloadKey).join(",")}]`;
  return `{${Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => `${JSON.stringify(key)}:${stableProgramRequestPayloadKey(item)}`).join(",")}}`;
}

export function normalizeProgramApiResponse<T>(result: ApiResponse<T> | undefined, response: Pick<Response, "ok" | "status" | "headers">): ApiResponse<T> {
  const requestId = response.headers.get("x-request-id") ?? result?.requestId;
  if (result?.ok === true && response.ok) {
    return { ...result, ok: true, status: response.status, ...(requestId ? { requestId } : {}) };
  }
  const status = response.status;
  return {
    ...result,
    ok: false,
    status,
    code: result?.code ?? defaultProgramApiErrorCode(status),
    retryable: result?.retryable ?? (status === 408 || status === 425 || status === 429 || status >= 500),
    error: result?.error ?? (status === 401 ? "Authentication is required." : "Program response could not be read."),
    ...(requestId ? { requestId } : {})
  };
}

function defaultProgramApiErrorCode(status: number): string {
  if (status === 400) return "invalid_request";
  if (status === 401) return "authentication_required";
  if (status === 403) return "permission_denied";
  if (status === 404) return "not_found";
  if (status === 409) return "conflict";
  if (status === 429) return "rate_limited";
  if (status >= 500) return "server_error";
  return "request_failed";
}

function emitRequest(metric: ProgramApiRequestMetric): void {
  if (process.env.NODE_ENV === "production" || typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<ProgramApiRequestMetric>("program-api:request", { detail: metric }));
  if (metric.programId === "automation-studio") {
    recordAutomationStudioRequestLifecycle(metric.endpoint, { phase: metric.phase, method: metric.method, requestId: metric.requestId, ok: metric.ok, aborted: metric.aborted });
    if (metric.endpoint === "save-project-hierarchy" && metric.phase === "started") recordAutomationStudioHierarchySaveRequest({ method: metric.method, requestId: metric.requestId });
  }
}
