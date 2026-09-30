"use client";

import { useMemo } from "react";
import { useProgramTransport } from "../data/use-program-transport";
import { improveFlowFromWebsiteAdaptation, saveFlowImprovementInstruction } from "./authoring-commands";

/** What the improvement panel calls, and nothing else. */
export type FlowImprovementCommands = {
  saveImprovementInstruction(payload: { projectId: string; flowId: string; instruction: string; instructionId?: string }): Promise<any>;
  improveFromWebsite(payload: { projectId: string; flowId: string; permittedConsequences?: string[] }): Promise<any>;
};

/** The improvement commands, bound to the Automation Studio transport. */
export function useFlowImprovementCommands(): FlowImprovementCommands {
  const transport = useProgramTransport("automation-studio");
  return useMemo(() => ({
    saveImprovementInstruction: (payload) => saveFlowImprovementInstruction(transport, payload),
    improveFromWebsite: (payload) => improveFlowFromWebsiteAdaptation(transport, payload)
  }), [transport]);
}
