"use client";

import { useMemo } from "react";
import { useProgramTransport } from "../data/use-program-transport";
import { applySubflowDirectoryAction, type SubflowDirectoryAction } from "./subflow-commands";
import { getSubflowDirectoryRouter, listFlowSubflows } from "./subflow-queries";
export type SubflowsViewHostModel = {
  projectId: string | null;
  flow: any;
};

export type SubflowsViewHostCommands = {
  onOpenSubflow?(flowId: string, subflowId: string, mode: "preview" | "new-window"): void;
};

export type SubflowCommands = {
  loadRouter(payload: Record<string, any>): ReturnType<typeof getSubflowDirectoryRouter>;
  listSubflows(payload: Record<string, any>): ReturnType<typeof listFlowSubflows>;
  applyAction(action: SubflowDirectoryAction, payload: Record<string, any>): ReturnType<typeof applySubflowDirectoryAction>;
};

export function useSubflowCommands(): SubflowCommands {
  const transport = useProgramTransport("automation-studio");
  return useMemo(() => ({
    loadRouter: (payload) => getSubflowDirectoryRouter(transport, payload),
    listSubflows: (payload) => listFlowSubflows(transport, payload),
    applyAction: (action, payload) => applySubflowDirectoryAction(transport, action, payload)
  }), [transport]);
}