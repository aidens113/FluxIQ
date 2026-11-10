"use client";

import { useMemo } from "react";
import { useProgramApi } from "../../programs/program-api";
import type { SettingsCallPayload, SettingsPort } from "../model";

/** The panel's program API as the Settings page's port: a read when no payload is given, else a post. */
export function useSettingsPort(): SettingsPort {
  const secretKeys = useProgramApi("secret-keys");
  const studio = useProgramApi("automation-studio");
  const identity = useProgramApi("identity-access");
  return useMemo<SettingsPort>(() => {
    const apis: Record<string, typeof secretKeys> = { "secret-keys": secretKeys, "automation-studio": studio, "identity-access": identity };
    return {
      async call<T>(programId: string, endpoint: string, payload?: SettingsCallPayload) {
        const api = apis[programId];
        if (!api) return { ok: false, error: "That part of FluxIQ is not available." };
        return payload ? api.post<T>(endpoint, payload) : api.get<T>(endpoint);
      }
    };
  }, [secretKeys, studio, identity]);
}
