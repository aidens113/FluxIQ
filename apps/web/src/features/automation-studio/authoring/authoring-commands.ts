import type { ProgramCommandTransport } from "../data/program-transport";
import { WEBSITE_EXPLORATION_OVERALL_TIMEOUT_MS } from "./blank-flow-authoring-model";

export const WEBSITE_EXPLORATION_COMMAND_TIMEOUT_MS = WEBSITE_EXPLORATION_OVERALL_TIMEOUT_MS;

export function generateFlowBootstrapAdaptation(api: ProgramCommandTransport, payload: { projectId: string; flowId: string; llmExecutionGrantId: string }) {
  return api.post<{ adaptation?: { projectId?: string; flowId?: string; adaptationId?: string; status?: string } }>("generate-flow-bootstrap-adaptation", payload);
}

export function saveFlowGenerationInstruction(api: ProgramCommandTransport, payload: { projectId: string; flowId: string; instruction: string }) {
  return api.post<{ instruction?: { instructionId?: string; status?: string } }>("save-flow-generation-instruction", payload);
}

export function generateFlowFromWebsiteExplorationAdaptation(api: ProgramCommandTransport, payload: { projectId: string; flowId: string; llmExecutionGrantId: string }) {
  return api.post<{ adaptation?: { projectId?: string; flowId?: string; adaptationId?: string; status?: string } }>("generate-flow-bootstrap-adaptation", {
    ...payload,
    evidenceGuided: true
  }, {
    policy: { timeoutMs: WEBSITE_EXPLORATION_COMMAND_TIMEOUT_MS }
  });
}
