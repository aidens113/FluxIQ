"use client";

import { useMemo } from "react";
import { useProgramTransport } from "../data/use-program-transport";
import { saveFlowInstruction } from "./instruction-commands";
import { getFlowInstruction, getFlowInstructionSet, getInstructionScopeRouter, listFlowInstructions, listInstructionScopeSubflows } from "./instruction-queries";
export type InstructionsViewHostModel = {
  projectId: string | null;
  flow: any;
};

export type InstructionsViewHostCommands = Record<string, never>;

export type InstructionCommands = {
  loadScopeRouter(payload: Record<string, any>): ReturnType<typeof getInstructionScopeRouter>;
  listScopeSubflows(payload: Record<string, any>): ReturnType<typeof listInstructionScopeSubflows>;
  loadEffectiveSet(payload: Record<string, any>): ReturnType<typeof getFlowInstructionSet>;
  listInstructions(payload: Record<string, any>): ReturnType<typeof listFlowInstructions>;
  loadInstruction(payload: Record<string, any>): ReturnType<typeof getFlowInstruction>;
  saveInstruction(payload: Record<string, any>): ReturnType<typeof saveFlowInstruction>;
};

export function useInstructionCommands(): InstructionCommands {
  const transport = useProgramTransport("automation-studio");
  return useMemo(() => ({
    loadScopeRouter: (payload) => getInstructionScopeRouter(transport, payload),
    listScopeSubflows: (payload) => listInstructionScopeSubflows(transport, payload),
    loadEffectiveSet: (payload) => getFlowInstructionSet(transport, payload),
    listInstructions: (payload) => listFlowInstructions(transport, payload),
    loadInstruction: (payload) => getFlowInstruction(transport, payload),
    saveInstruction: (payload) => saveFlowInstruction(transport, payload)
  }), [transport]);
}