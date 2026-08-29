"use client";

import { useMemo } from "react";
import type { ApiResponse } from "../../programs/program-api";
import { useProgramTransport } from "../data/use-program-transport";
import { changeSubflowLifecycle, saveFlowSettings, updateSubflowSettings } from "./settings-commands";
import { listFlowPublications, loadSubflowSettingsResources } from "./settings-queries";
export type SettingsViewHostModel = {
  projectId: string | null;
  flow: any;
};

export type SettingsViewHostCommands = Record<string, never>;

export type SettingsCommands = {
  listLlmSecrets(): Promise<ApiResponse<{ keys?: any[] }>>;
  listPublications(payload: Record<string, any>): ReturnType<typeof listFlowPublications>;
  loadSubflowResources(payload: { projectId: string; flowId: string; subflowId: string }): ReturnType<typeof loadSubflowSettingsResources>;
  saveFlow(payload: Record<string, any>): ReturnType<typeof saveFlowSettings>;
  updateSubflow(payload: Record<string, any>): ReturnType<typeof updateSubflowSettings>;
  changeSubflowLifecycle(endpoint: "enable-flow-subflow" | "disable-flow-subflow" | "archive-flow-subflow", payload: Record<string, any>): ReturnType<typeof changeSubflowLifecycle>;
};

export function useSettingsCommands(): SettingsCommands {
  const automationTransport = useProgramTransport("automation-studio");
  const secretTransport = useProgramTransport("secret-keys");
  return useMemo(() => ({
    listLlmSecrets: () => secretTransport.get<{ keys?: any[] }>("snapshot"),
    listPublications: (payload) => listFlowPublications(automationTransport, payload),
    loadSubflowResources: (payload) => loadSubflowSettingsResources(automationTransport, payload),
    saveFlow: (payload) => saveFlowSettings(automationTransport, payload),
    updateSubflow: (payload) => updateSubflowSettings(automationTransport, payload),
    changeSubflowLifecycle: (endpoint, payload) => changeSubflowLifecycle(automationTransport, endpoint, payload)
  }), [automationTransport, secretTransport]);
}