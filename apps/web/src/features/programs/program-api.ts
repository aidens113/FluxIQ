"use client";

import { useMemo } from "react";
import { useSearchParams } from "next/navigation";

export type ApiResponse<T = unknown> = { ok: boolean; payload?: T; error?: string };
export type JsonObject = Record<string, unknown>;

export function useProgramApi(programId: string) {
  const searchParams = useSearchParams();
  const domainId = searchParams.get("domainId");
  const endpointUrl = (endpoint: string) => {
    const query = domainId ? `?domainId=${encodeURIComponent(domainId)}` : "";
    return `/api/programs/${programId}/${endpoint}${query}`;
  };
  return useMemo(() => ({
    async get<T = unknown>(endpoint: string): Promise<ApiResponse<T>> {
      const response = await fetch(endpointUrl(endpoint), { cache: "no-store" });
      if (response.status === 401) window.location.href = "/";
      return response.json() as Promise<ApiResponse<T>>;
    },
    async post<T = unknown>(endpoint: string, payload: JsonObject): Promise<ApiResponse<T>> {
      const response = await fetch(endpointUrl(endpoint), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      if (response.status === 401) window.location.href = "/";
      return response.json() as Promise<ApiResponse<T>>;
    }
  }), [programId, domainId]);
}
