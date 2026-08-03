"use client";

import { useMemo } from "react";

export type ApiResponse<T = unknown> = { ok: boolean; payload?: T; error?: string };
export type JsonObject = Record<string, unknown>;

export function useProgramApi(programId: string) {
  return useMemo(() => ({
    async get<T = unknown>(endpoint: string): Promise<ApiResponse<T>> {
      const response = await fetch(`/api/programs/${programId}/${endpoint}`, { cache: "no-store" });
      if (response.status === 401) window.location.href = "/";
      return response.json() as Promise<ApiResponse<T>>;
    },
    async post<T = unknown>(endpoint: string, payload: JsonObject): Promise<ApiResponse<T>> {
      const response = await fetch(`/api/programs/${programId}/${endpoint}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      if (response.status === 401) window.location.href = "/";
      return response.json() as Promise<ApiResponse<T>>;
    }
  }), [programId]);
}
