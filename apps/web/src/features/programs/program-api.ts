"use client";

import { useMemo } from "react";
import { useSearchParams } from "next/navigation";

export type ApiResponse<T = unknown> = { ok: boolean; payload?: T; error?: string };
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
  if (/^(create|update|save|delete|review|approve|reject|run|finalize|publish|deprecate|repair)-/.test(endpoint)) return "mutation";
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
        return result ?? { ok: false, error: "Program response could not be read." };
      } catch {
        emitMetric({
          programId,
          endpoint,
          method,
          elapsedMs: performance.now() - startedAt,
          responseBytes: 0,
          classification: classifyProgramApiEndpoint(endpoint, payload),
          ok: false
        });
        return { ok: false, error: "Program request could not be completed." };
      }
    };
    return {
      async get<T = unknown>(endpoint: string): Promise<ApiResponse<T>> {
        return readResponse<T>(endpoint, "GET", undefined, fetch(endpointUrl(endpoint), { cache: "no-store" }));
      },
      async post<T = unknown>(endpoint: string, payload: JsonObject): Promise<ApiResponse<T>> {
        return readResponse<T>(endpoint, "POST", payload, fetch(endpointUrl(endpoint), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) }));
      }
    };
  }, [programId, domainId]);
}
