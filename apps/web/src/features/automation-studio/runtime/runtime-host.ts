"use client";

import { useMemo } from "react";
import { useProgramTransport } from "../data/use-program-transport";
import { cancelRuntimeSession, executeRuntimeSession, exportRuntimeRunAudit, startRuntimeSession } from "./run-commands";
import { getRuntimeFlowReadiness, getRuntimeRunActionDetail, getRuntimeRunDetail, getRuntimeRunEventDetail, listRuntimeRunActions, listRuntimeRunEvents, listRuntimeRuns } from "./run-queries";
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
  onOpenReadinessTarget?(target: "instructions" | "router" | "nodes" | "subflows"): void;
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
  loadDetail(payload: { projectId: string; runId: string; compact: true }, signal?: AbortSignal): ReturnType<typeof getRuntimeRunDetail>;
  listActions(payload: { projectId: string; runId: string; limit: number; offset?: number; cursor?: string | null }, signal?: AbortSignal): ReturnType<typeof listRuntimeRunActions>;
  loadActionDetail?(payload: { projectId: string; runId: string; attemptId: string }, signal?: AbortSignal): ReturnType<typeof getRuntimeRunActionDetail>;
  listEvents(payload: { projectId: string; runId: string; afterSequence?: number; cursor?: string | null; limit: number }, signal?: AbortSignal): ReturnType<typeof listRuntimeRunEvents>;
  loadEventDetail?(payload: { projectId: string; runId: string; sequence: number }, signal?: AbortSignal): ReturnType<typeof getRuntimeRunEventDetail>;
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
    loadDetail: (payload, signal) => getRuntimeRunDetail(transport, payload, signal),
    listActions: (payload, signal) => listRuntimeRunActions(transport, payload, signal),
    loadActionDetail: (payload, signal) => getRuntimeRunActionDetail(transport, payload, signal),
    listEvents: (payload, signal) => listRuntimeRunEvents(transport, payload, signal),
    loadEventDetail: (payload, signal) => getRuntimeRunEventDetail(transport, payload, signal),
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
