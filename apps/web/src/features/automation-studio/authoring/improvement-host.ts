"use client";

import { useMemo } from "react";
import { useProgramTransport } from "../data/use-program-transport";
import { improveFlowFromWebsiteAdaptation, saveFlowImprovementInstruction } from "./authoring-commands";

/** What the improvement panel calls, and nothing else. */
export type FlowImprovementCommands = {
  preflightLlm(payload: Record<string, any>): Promise<any>;
  issueLlmGrant(payload: Record<string, any>): Promise<any>;
  saveImprovementInstruction(payload: { projectId: string; flowId: string; instruction: string; instructionId?: string }): Promise<any>;
  improveFromWebsite(payload: { projectId: string; flowId: string; llmExecutionGrantId: string }): Promise<any>;
};

/**
 * The improvement commands, from the preflight and grant commands the host
 * already holds. Those two stay the host's -- the runtime owns them and already
 * imports this module -- and the two an improvement adds are bound here.
 */
export function useFlowImprovementCommands(base: Pick<FlowImprovementCommands, "preflightLlm" | "issueLlmGrant">): FlowImprovementCommands {
  const transport = useProgramTransport("automation-studio");
  const { preflightLlm, issueLlmGrant } = base;
  return useMemo(() => ({
    preflightLlm,
    issueLlmGrant,
    saveImprovementInstruction: (payload) => saveFlowImprovementInstruction(transport, payload),
    improveFromWebsite: (payload) => improveFlowFromWebsiteAdaptation(transport, payload)
  }), [issueLlmGrant, preflightLlm, transport]);
}
