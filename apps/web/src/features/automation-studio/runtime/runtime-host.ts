"use client";

import { useMemo } from "react";
import { useProgramTransport } from "../data/use-program-transport";
import { cancelRuntimeSession, executeRuntimeSession, exportRuntimeRunAudit, startRuntimeSession } from "./run-commands";
import { getRuntimeFlowReadiness, getRuntimeRunDetail, listRuntimeRunActions, listRuntimeRunEvents, listRuntimeRuns } from "./run-queries";
export type RuntimeViewHostModel = {
  projectId: string | null;
  flow?: any;
  pipelineArtifacts: any;
  selectedTimeline: any | null;
  models: any[];
  policies: any[];
  runtimeSessions: any[];
};

export type RuntimeViewHostCommands = {
  onOpenAdaptation?(flowId: string | undefined, adaptationId: string): void;
  onOpenReadinessTarget?(target: "problems" | "instructions" | "router" | "nodes"): void;
};
export type RuntimeHistoryViewHostModel = {
  projectId: string | null;
  pipelineArtifacts: any;
  runtimeSessions: any[];
};

export type RuntimeHistoryViewHostCommands = Record<string, never>;

export type RuntimeHistoryCommands = {
  listRuns(payload: Record<string, any>): ReturnType<typeof listRuntimeRuns>;
};

export type RuntimeDetailCommands = {
  loadDetail(payload: { projectId: string; runId: string; compact: true }): ReturnType<typeof getRuntimeRunDetail>;
  listActions(payload: { projectId: string; runId: string; limit: number; offset: number }): ReturnType<typeof listRuntimeRunActions>;
  listEvents(payload: { projectId: string; runId: string; afterSequence: number; limit: number }): ReturnType<typeof listRuntimeRunEvents>;
  exportAudit(payload: { projectId: string; runId: string }): ReturnType<typeof exportRuntimeRunAudit>;
};

export type RuntimeExecutionCommands = {
  loadReadiness(payload: { projectId: string; flowId: string }): ReturnType<typeof getRuntimeFlowReadiness>;
  start(payload: Record<string, any>): ReturnType<typeof startRuntimeSession>;
  execute(payload: Record<string, any>): ReturnType<typeof executeRuntimeSession>;
  cancel(payload: { projectId: string; runId: string }): ReturnType<typeof cancelRuntimeSession>;
};

export function useRuntimeHistoryCommands(): RuntimeHistoryCommands {
  const transport = useProgramTransport("automation-studio");
  return useMemo(() => ({ listRuns: (payload) => listRuntimeRuns(transport, payload) }), [transport]);
}

export function useRuntimeDetailCommands(): RuntimeDetailCommands {
  const transport = useProgramTransport("automation-studio");
  return useMemo(() => ({
    loadDetail: (payload) => getRuntimeRunDetail(transport, payload),
    listActions: (payload) => listRuntimeRunActions(transport, payload),
    listEvents: (payload) => listRuntimeRunEvents(transport, payload),
    exportAudit: (payload) => exportRuntimeRunAudit(transport, payload)
  }), [transport]);
}

export function useRuntimeExecutionCommands(): RuntimeExecutionCommands {
  const transport = useProgramTransport("automation-studio");
  return useMemo(() => ({
    loadReadiness: (payload) => getRuntimeFlowReadiness(transport, payload),
    start: (payload) => startRuntimeSession(transport, payload),
    execute: (payload) => executeRuntimeSession(transport, payload),
    cancel: (payload) => cancelRuntimeSession(transport, payload)
  }), [transport]);
}