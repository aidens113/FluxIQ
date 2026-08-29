"use client";

import { useMemo } from "react";
import { useProgramTransport } from "../data/use-program-transport";
import { reviewFlowAdaptation } from "./adaptation-commands";
import { getFlowAdaptation, listFlowAdaptations } from "./adaptation-queries";
export type AdaptationsViewHostModel = {
  projectId: string | null;
  flow: any;
  requestedAdaptationId?: string;
};

export type AdaptationsViewHostCommands = { onSelectedAdaptationChange?(adaptationId: string): void };

export type AdaptationCommands = {
  listAdaptations(payload: Record<string, any>): ReturnType<typeof listFlowAdaptations>;
  loadAdaptation(payload: Record<string, any>): ReturnType<typeof getFlowAdaptation>;
  reviewAdaptation(payload: Record<string, any>): ReturnType<typeof reviewFlowAdaptation>;
};

export function useAdaptationCommands(): AdaptationCommands {
  const transport = useProgramTransport("automation-studio");
  return useMemo(() => ({
    listAdaptations: (payload) => listFlowAdaptations(transport, payload),
    loadAdaptation: (payload) => getFlowAdaptation(transport, payload),
    reviewAdaptation: (payload) => reviewFlowAdaptation(transport, payload)
  }), [transport]);
}