"use client";

import { useMemo } from "react";
import { useProgramTransport } from "../data/use-program-transport";
import { cancelRuntimeSession, executeRuntimeSession, exportRuntimeRunAudit, getRuntimeRunControl, pauseRuntimeSession, resumeRuntimeSession, startRuntimeSession } from "./run-commands";
import { getRuntimeFlowReadiness, getRuntimeRunActionDetail, getRuntimeRunDetail, getRuntimeRunEventDetail, listRuntimeRunActions, listRuntimeRunEvents, listRuntimeRuns } from "./run-queries";
import { generateFlowBootstrapAdaptation, generateFlowFromWebsiteExplorationAdaptation, saveFlowGenerationInstruction } from "../authoring/authoring-commands";
import { currentProgramDomainId, deleteRunDatasets, exportRunDataset, getRunDatasetPage, listRunDatasets, runDatasetDownloadHref, type RunDatasetCommands } from "../datasets";
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
  /**
   * Reads, exports, and deletes the datasets the run stored (K9). Optional
   * because several suites build this command set as a literal; the host hook
   * always binds it, and the panel is mounted only when it is present.
   */
  datasets?: RunDatasetCommands;
};

export type RuntimeExecutionCommands = {
  loadReadiness(payload: { projectId: string; flowId: string }): ReturnType<typeof getRuntimeFlowReadiness>;
  start(payload: Record<string, any>): ReturnType<typeof startRuntimeSession>;
  execute(payload: Record<string, any>): ReturnType<typeof executeRuntimeSession>;
  generateBootstrap(payload: { projectId: string; flowId: string; permittedConsequences?: string[] }): ReturnType<typeof generateFlowBootstrapAdaptation>;
  saveGenerationInstruction(payload: { projectId: string; flowId: string; instruction: string }): ReturnType<typeof saveFlowGenerationInstruction>;
  generateFromWebsite(payload: { projectId: string; flowId: string; permittedConsequences?: string[] }): ReturnType<typeof generateFlowFromWebsiteExplorationAdaptation>;
  cancel(payload: { projectId: string; runId: string }): ReturnType<typeof cancelRuntimeSession>;
  /**
   * Pause, take control, resume, and the live read behind them. Optional for
   * the same reason `datasets` is: suites build this set as a literal, and the
   * run controls are shown only when the host binds them.
   */
  pause?(payload: Parameters<typeof pauseRuntimeSession>[1]): ReturnType<typeof pauseRuntimeSession>;
  resume?(payload: Parameters<typeof resumeRuntimeSession>[1]): ReturnType<typeof resumeRuntimeSession>;
  readControl?(payload: Parameters<typeof getRuntimeRunControl>[1]): ReturnType<typeof getRuntimeRunControl>;
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
    exportAudit: (payload) => exportRuntimeRunAudit(transport, payload),
    datasets: {
      list: (payload, signal) => listRunDatasets(transport, payload, signal),
      page: (payload, signal) => getRunDatasetPage(transport, payload, signal),
      export: (payload) => exportRunDataset(transport, payload),
      remove: (payload) => deleteRunDatasets(transport, payload),
      downloadHref: (input) => runDatasetDownloadHref({
        projectId: input.projectId,
        runId: input.runId,
        datasetId: input.datasetId,
        format: input.format,
        domainId: currentProgramDomainId()
      })
    }
  }), [transport]);
}

export function useRuntimeExecutionCommands(): RuntimeExecutionCommands {
  const transport = useProgramTransport("automation-studio");
  return useMemo(() => ({
    loadReadiness: (payload) => getRuntimeFlowReadiness(transport, payload),
    start: (payload) => startRuntimeSession(transport, payload),
    execute: (payload) => executeRuntimeSession(transport, payload),
    generateBootstrap: (payload) => generateFlowBootstrapAdaptation(transport, payload),
    saveGenerationInstruction: (payload) => saveFlowGenerationInstruction(transport, payload),
    generateFromWebsite: (payload) => generateFlowFromWebsiteExplorationAdaptation(transport, payload),
    cancel: (payload) => cancelRuntimeSession(transport, payload),
    pause: (payload) => pauseRuntimeSession(transport, payload),
    resume: (payload) => resumeRuntimeSession(transport, payload),
    readControl: (payload) => getRuntimeRunControl(transport, payload)
  }), [transport]);
}
