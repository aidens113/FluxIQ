"use client";

import { useMemo } from "react";
import { useSearchParams } from "next/navigation";

export type ApiResponse<T = unknown> = { ok: boolean; payload?: T; error?: string };
export type JsonObject = Record<string, unknown>;

export function useProgramApi(programId: string) {
  const searchParams = useSearchParams();
  const domainId = searchParams.get("domainId");
  return useMemo(() => {
    const endpointUrl = (endpoint: string) => {
      const query = domainId ? `?domainId=${encodeURIComponent(domainId)}` : "";
      return `/api/programs/${programId}/${endpoint}${query}`;
    };
    const readResponse = async <T,>(request: Promise<Response>): Promise<ApiResponse<T>> => {
      try {
        const response = await request;
        if (response.status === 401) window.location.href = "/";
        const result = await response.json().catch(() => undefined) as ApiResponse<T> | undefined;
        return result ?? { ok: false, error: "Program response could not be read." };
      } catch {
        return { ok: false, error: "Program request could not be completed." };
      }
    };
    return {
      async get<T = unknown>(endpoint: string): Promise<ApiResponse<T>> {
        return readResponse<T>(fetch(endpointUrl(endpoint), { cache: "no-store" }));
      },
      async post<T = unknown>(endpoint: string, payload: JsonObject): Promise<ApiResponse<T>> {
        return readResponse<T>(fetch(endpointUrl(endpoint), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) }));
      }
    };
  }, [programId, domainId]);
}
