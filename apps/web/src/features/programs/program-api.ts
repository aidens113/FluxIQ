"use client";

import { useMemo } from "react";
import { useSearchParams } from "next/navigation";
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

export function estimateProgramApiPayloadBytes(value: unknown): number {
  try {
    return new Blob([JSON.stringify(value)]).size;
  } catch {
    return 0;
  }
}

export function classifyProgramApiEndpoint(endpoint: string, payload?: JsonObject): ProgramApiMetric["classification"] {
  if (/^(append|apply|approve|create|deprecate|delete|finalize|generate|mine|normalize|propose|publish|reject|repair|reorder|review|run|save|set|start|stop|update)-/.test(endpoint)) return "mutation";
  if (endpoint.startsWith("get-") || endpoint.includes("-detail") || endpoint.endsWith("-detail")) return "detail";
  if (endpoint.startsWith("list-") || endpoint.includes("summary") || endpoint.includes("summaries") || payload?.summaries === true) return "summary";
  return "other";
}

export function useProgramApi(programId: string) {
  const searchParams = useSearchParams();
  const domainId = searchParams.get("domainId");
  return useMemo(() => {
    const endpointUrl = (endpoint: string) => {
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
      window.dispatchEvent(new CustomEvent("program-api:mutation", {
        detail: { programId, endpoint, projectId: typeof payload?.projectId === "string" ? payload.projectId : undefined }
      }));
    };
    const readResponse = async <T,>(endpoint: string, method: "GET" | "POST", payload: JsonObject | undefined, request: Promise<Response>): Promise<ApiResponse<T>> => {
      const startedAt = performance.now();
      try {
        const response = await request;
        if (response.status === 401) window.location.href = "/";
        const result = await response.json().catch(() => undefined) as ApiResponse<T> | undefined;
        emitMetric({
          programId,
          endpoint,
          method,
          elapsedMs: performance.now() - startedAt,
          responseBytes: estimateProgramApiPayloadBytes(result),
          classification: classifyProgramApiEndpoint(endpoint, payload),
          ok: result?.ok === true
        });
        if (result?.ok) emitMutation(endpoint, payload);
        return result ?? { ok: false, error: "Program response could not be read." };
      } catch (error) {
        const aborted = error instanceof DOMException && error.name === "AbortError";
        emitMetric({
          programId,
          endpoint,
          method,
          elapsedMs: performance.now() - startedAt,
          responseBytes: 0,
          classification: classifyProgramApiEndpoint(endpoint, payload),
          ok: false
        });
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
