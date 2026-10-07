import type { ProgramCommandTransport } from "../data/program-transport";
import { saveFlowInstruction } from "../instructions";
import { WEBSITE_EXPLORATION_OVERALL_TIMEOUT_MS } from "./blank-flow-authoring-model";
import { improvementInstruction } from "./existing-flow-improvement";
import { screenFlowAuthoringResponse, type FlowAuthoringPayload } from "./flow-authoring-response";

// A website exploration iterates for as long as Core lets the run go on, so the
// browser waits out the whole run and the reply.
export const WEBSITE_EXPLORATION_COMMAND_TIMEOUT_MS = WEBSITE_EXPLORATION_OVERALL_TIMEOUT_MS;

export function generateFlowBootstrapAdaptation(api: ProgramCommandTransport, payload: { projectId: string; flowId: string; permittedConsequences?: string[] }) {
  return api.post<{ adaptation?: { projectId?: string; flowId?: string; adaptationId?: string; status?: string } }>("generate-flow-bootstrap-adaptation", payload);
}

export function saveFlowGenerationInstruction(api: ProgramCommandTransport, payload: { projectId: string; flowId: string; instruction: string }) {
  return api.post<{ instruction?: { instructionId?: string; status?: string } }>("save-flow-generation-instruction", payload);
}

/**
 * Builds a blank Flow by exploring the website. How it is authored is Core's
 * own setting, asked for as `configured` (`./flow-authoring-response.ts`).
 */
export async function generateFlowFromWebsiteExplorationAdaptation(api: ProgramCommandTransport, payload: { projectId: string; flowId: string; permittedConsequences?: string[] }) {
  const response = await api.post<FlowAuthoringPayload>("generate-flow-bootstrap-adaptation", {
    ...payload,
    evidenceGuided: true,
    authoringMode: "configured"
  }, {
    policy: { timeoutMs: WEBSITE_EXPLORATION_COMMAND_TIMEOUT_MS }
  });
  return screenFlowAuthoringResponse(response, payload);
}

/**
 * Improves a Flow that already has steps. It is an exploration -- the model
 * opens the page and sees what the Flow does not handle -- run as Core's
 * `extend`, so the Flow's own steps are the draft the model amends and its
 * Router, Subflow and node ids are kept. Authored in Core's own mode, as above.
 */
export async function improveFlowFromWebsiteAdaptation(api: ProgramCommandTransport, payload: { projectId: string; flowId: string; permittedConsequences?: string[] }) {
  const response = await api.post<FlowAuthoringPayload>("generate-flow-bootstrap-adaptation", {
    ...payload,
    evidenceGuided: true,
    authoringMode: "configured",
    mode: "extend"
  }, {
    policy: { timeoutMs: WEBSITE_EXPLORATION_COMMAND_TIMEOUT_MS }
  });
  return screenFlowAuthoringResponse(response, payload);
}

/**
 * Saves what a person said should change as a standing, required instruction
 * on the Flow. `save-flow-generation-instruction` is creation's and refuses a
 * Flow that already has steps; an improvement is one more thing the Flow is
 * asked to do, beside what it was already asked, so it is an instruction of
 * its own.
 */
export function saveFlowImprovementInstruction(api: ProgramCommandTransport, payload: { projectId: string; flowId: string; instruction: string; instructionId?: string }) {
  return saveFlowInstruction(api, {
    projectId: payload.projectId,
    flowId: payload.flowId,
    // Given, the person reworded an improvement they already asked for, so the
    // same instruction is updated rather than a second one left beside it.
    ...(payload.instructionId ? { instructionId: payload.instructionId } : {}),
    ...improvementInstruction(payload.instruction)
  });
}
