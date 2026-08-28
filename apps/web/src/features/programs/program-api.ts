"use client";

import { useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { assertAutomationStudioBrowserEndpointAllowed } from "../automation-studio/data-request-policy";
import { recordAutomationStudioHierarchySaveRequest, recordAutomationStudioRequestLifecycle } from "./ui-performance";
import { evaluateRequestBudget } from "./ui-performance-budgets";

export type ApiResponse<T = unknown> = { ok: boolean; payload?: T; error?: string; aborted?: boolean };
export type ProgramApiRequestOptions = { signal?: AbortSignal };
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
    const readResponse = async <T,>(endpoint: string, method: "GET" | "POST", payload: JsonObject | undefined, request: Promise<Response>): Promise<ApiResponse<T>> => {
      const startedAt = performance.now();
      const requestId = ++programApiRequestSequence;
      emitRequest({ requestId, programId, endpoint, method, phase: "started", startedAt });
      try {
        const response = await request;
        if (response.status === 401) window.location.href = "/";
        const result = await response.json().catch(() => undefined) as ApiResponse<T> | undefined;
        const metric = {
          programId,
          endpoint,
          method,
          elapsedMs: performance.now() - startedAt,
          responseBytes: estimateProgramApiPayloadBytes(result),
          classification: classifyProgramApiEndpoint(endpoint, payload),
          ok: result?.ok === true
        } satisfies ProgramApiMetric;
        emitMetric(metric);
        emitRequest({ requestId, programId, endpoint, method, phase: "finished", startedAt, elapsedMs: metric.elapsedMs, ok: metric.ok });
        if (result?.ok) emitMutation(endpoint, payload);
        return result ?? { ok: false, error: "Program response could not be read." };
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
          ? { ok: false, aborted: true, error: "Program request was cancelled." }
          : { ok: false, error: "Program request could not be completed." };
      }
    };
    return {
      async get<T = unknown>(endpoint: string, options: ProgramApiRequestOptions = {}): Promise<ApiResponse<T>> {
        return readResponse<T>(endpoint, "GET", undefined, fetch(endpointUrl(endpoint), { cache: "no-store", ...(options.signal ? { signal: options.signal } : {}) }));
      },
      async post<T = unknown>(endpoint: string, payload: JsonObject, options: ProgramApiRequestOptions = {}): Promise<ApiResponse<T>> {
        return readResponse<T>(endpoint, "POST", payload, fetch(endpointUrl(endpoint), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload), ...(options.signal ? { signal: options.signal } : {}) }));
      }
    };
  }, [programId, domainId]);
}

function emitRequest(metric: ProgramApiRequestMetric): void {
  if (process.env.NODE_ENV === "production" || typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<ProgramApiRequestMetric>("program-api:request", { detail: metric }));
  if (metric.programId === "automation-studio") {
    recordAutomationStudioRequestLifecycle(metric.endpoint, { phase: metric.phase, method: metric.method, requestId: metric.requestId, ok: metric.ok, aborted: metric.aborted });
    if (metric.endpoint === "save-project-hierarchy" && metric.phase === "started") recordAutomationStudioHierarchySaveRequest({ method: metric.method, requestId: metric.requestId });
  }
}
