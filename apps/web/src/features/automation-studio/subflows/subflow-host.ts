"use client";

import { useMemo } from "react";
import { useProgramTransport } from "../data/use-program-transport";
import { applySubflowDirectoryAction, type SubflowDirectoryAction } from "./subflow-commands";
import { listFlowSubflows, listSubflowRouterReferences } from "./subflow-queries";
export type SubflowsViewHostModel = {
  projectId: string | null;
  flow: any;
};

export type SubflowsViewHostCommands = {
  onOpenSubflow?(flowId: string, subflowId: string, mode: "preview" | "new-pane-or-focus"): void;
};

export type SubflowCommands = {
  loadReferences(payload: Record<string, any>): ReturnType<typeof listSubflowRouterReferences>;
  listSubflows(payload: Record<string, any>): ReturnType<typeof listFlowSubflows>;
  applyAction(action: SubflowDirectoryAction, payload: Record<string, any>): ReturnType<typeof applySubflowDirectoryAction>;
};

export function useSubflowCommands(): SubflowCommands {
  const transport = useProgramTransport("automation-studio");
  return useMemo(() => ({
    loadReferences: (payload) => listSubflowRouterReferences(transport, payload),
    listSubflows: (payload) => listFlowSubflows(transport, payload),
    applyAction: (action, payload) => applySubflowDirectoryAction(transport, action, payload)
  }), [transport]);
}
