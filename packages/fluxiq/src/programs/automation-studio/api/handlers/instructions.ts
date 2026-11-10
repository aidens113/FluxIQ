// Flow instructions, their instruction sets, and the change proposals raised
// against them.

import { getFlowChangeProposalInput, getFlowInstructionInput, getFlowInstructionReadinessInput, getFlowInstructionSetInput, listFlowChangeProposalsInput, listFlowInstructionsInput, saveFlowInstructionInput } from "@fluxiq/contracts/program-api-inputs";
import { AUTOMATION_STUDIO_ENDPOINTS, type FlowChangeProposalRequest, type FlowExpansionSummaryRequest, type FlowInstructionRequest, type FlowInstructionSetRequest, type SaveFlowInstructionRequest } from "../../../../api-contracts/automation.ts";
import type { AutomationStudioService } from "../../../../framework/automation-service/index.ts";
import { saveFlowInstructionForRequest } from "../../../../framework/automation-service/service/flow-instruction-requests/index.ts";
import type { AutomationStudioApiDependencies } from "./dependencies.ts";
import { endpointResource } from "../../../_shared/iam/index.ts";

export function registerInstructionEndpoints(dependencies: AutomationStudioApiDependencies): void {
  const { registry, service } = dependencies;
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.listFlowInstructions, assistant: { input: listFlowInstructionsInput, summary: "Lists the instructions given to Flows in a project.", phrases: ["show my instructions","what instructions does this flow have"], contextArgs: { projectId: "projectId", flowId: "flowId" } },
    permission: "programs.read",
    classification: "read",
    action: "studio:ListFlowInstructions",
    accessLevel: "List",
    resource: endpointResource.project(),
    handler: async (request) => {
      const payload = request.payload && typeof request.payload === "object" ? request.payload as FlowExpansionSummaryRequest : {} as FlowExpansionSummaryRequest;
      const input: Parameters<AutomationStudioService["listFlowInstructionSummaries"]>[0] = { projectId: String(payload.projectId ?? ""), limit: payload.limit, offset: payload.offset };
      if (typeof payload.flowId === "string") input.flowId = payload.flowId;
      if (typeof payload.subflowId === "string") input.subflowId = payload.subflowId;
      if (typeof payload.status === "string") input.status = payload.status;
      if (typeof payload.scopeKind === "string") input.scopeKind = payload.scopeKind;
      if (typeof payload.requirement === "string") input.requirement = payload.requirement;
      if (typeof payload.search === "string") input.search = payload.search;
      if (payload.sort === "updated" || payload.sort === "title" || payload.sort === "status" || payload.sort === "scope" || payload.sort === "priority") input.sort = payload.sort;
      if (payload.direction === "asc" || payload.direction === "desc") input.direction = payload.direction;
      const page = await service.listFlowInstructionSummaries(input);
      return { ok: true, payload: { instructions: page.instructions, page } };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.getFlowInstruction, assistant: { input: getFlowInstructionInput, summary: "Reads one instruction in full.", phrases: ["open this instruction"], contextArgs: { projectId: "projectId" } },
    permission: "programs.read",
    classification: "read",
    action: "studio:GetFlowInstruction",
    accessLevel: "Read",
    resource: endpointResource.project(),
    handler: async (request) => {
      const payload = request.payload && typeof request.payload === "object" ? request.payload as FlowInstructionRequest : {} as FlowInstructionRequest;
      return { ok: true, payload: { instruction: await service.getFlowInstruction(String(payload.projectId ?? ""), String(payload.instructionId ?? "")) } };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.getFlowInstructionSet, assistant: { input: getFlowInstructionSetInput, summary: "Reads every instruction that applies to a Flow.", phrases: ["show all the rules for this flow"], contextArgs: { projectId: "projectId", flowId: "flowId" } },
    permission: "programs.read",
    classification: "read",
    action: "studio:GetFlowInstructionSet",
    accessLevel: "Read",
    resource: endpointResource.project(),
    handler: async (request) => {
      const payload = request.payload && typeof request.payload === "object" ? request.payload as FlowInstructionSetRequest : {} as FlowInstructionSetRequest;
      const input: Parameters<AutomationStudioService["getFlowInstructionSet"]>[0] = { projectId: String(payload.projectId ?? "") };
      if (typeof payload.flowId === "string") input.flowId = payload.flowId;
      if (typeof payload.subflowId === "string") input.subflowId = payload.subflowId;
      return { ok: true, payload: { instructions: await service.getFlowInstructionSet(input) } };
    }
  });
  registry.register({ programId: "automation-studio", endpoint: AUTOMATION_STUDIO_ENDPOINTS.getFlowInstructionReadiness, assistant: { input: getFlowInstructionReadinessInput, summary: "Checks whether a Flow's instructions are enough to build or run it.", phrases: ["is this flow ready","are my instructions complete"], contextArgs: { projectId: "projectId", flowId: "flowId" } }, permission: "programs.read", classification: "read", action: "studio:GetFlowInstructionReadiness", accessLevel: "Read", resource: endpointResource.projectChild("flow", "flowId"), handler: async request => {
    const payload = request.payload && typeof request.payload === "object" ? request.payload as Record<string, unknown> : {};
    return { ok: true, payload: await service.instructionAuthority.readiness({ projectId: String(payload.projectId ?? ""), flowId: String(payload.flowId ?? "") }) };
  } });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.saveFlowInstruction, assistant: { input: saveFlowInstructionInput, summary: "Adds an instruction to a Flow, or changes one that exists.", phrases: ["tell the flow to","add an instruction","change that instruction"], contextArgs: { projectId: "projectId", flowId: "flowId" } },
    permission: "flows.write",
    classification: "authoring",
    action: "studio:SaveFlowInstruction",
    accessLevel: "Write",
    resource: endpointResource.projectChild("flow", "flowId"),
    handler: async (request) => {
      const payload = request.payload && typeof request.payload === "object" ? request.payload as SaveFlowInstructionRequest & { authSessionId?: unknown; authorizationPin?: unknown } : {} as SaveFlowInstructionRequest;
      const projectId = String(payload.projectId ?? "");
      const flowId = String(payload.flowId ?? "");
      const title = typeof payload.title === "string" ? payload.title.trim() : "";
      const body = typeof payload.body === "string" ? payload.body.trim() : "";
      if (!projectId || !flowId) return { ok: false, error: "Project and Flow are required." };
      if (!title || !body) return { ok: false, error: "Instruction title and body are required." };
      return { ok: true, payload: { instruction: await saveFlowInstructionForRequest(service, { projectId, flowId, title, body, payload }) } };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.listFlowChangeProposals, assistant: { input: listFlowChangeProposalsInput, summary: "Lists the changes proposed for a project's Flows.", phrases: ["show proposed changes","what changes were suggested"], contextArgs: { projectId: "projectId", flowId: "flowId" } },
    permission: "programs.read",
    classification: "read",
    action: "studio:ListFlowChangeProposals",
    accessLevel: "List",
    resource: endpointResource.project(),
    handler: async (request) => {
      const payload = request.payload && typeof request.payload === "object" ? request.payload as FlowExpansionSummaryRequest : {} as FlowExpansionSummaryRequest;
      const input: Parameters<AutomationStudioService["listFlowChangeProposalSummaries"]>[0] = { projectId: String(payload.projectId ?? ""), limit: payload.limit, offset: payload.offset };
      if (typeof payload.flowId === "string") input.flowId = payload.flowId;
      if (typeof payload.subflowId === "string") input.subflowId = payload.subflowId;
      const page = await service.listFlowChangeProposalSummaries(input);
      return { ok: true, payload: { changeProposals: page.changeProposals, page } };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.getFlowChangeProposal, assistant: { input: getFlowChangeProposalInput, summary: "Reads one proposed change in full.", phrases: ["open this proposed change"], contextArgs: { projectId: "projectId", flowId: "flowId" } },
    permission: "programs.read",
    classification: "read",
    action: "studio:GetFlowChangeProposal",
    accessLevel: "Read",
    resource: endpointResource.projectChild("flow", "flowId"),
    handler: async (request) => {
      const payload = request.payload && typeof request.payload === "object" ? request.payload as FlowChangeProposalRequest : {} as FlowChangeProposalRequest;
      return { ok: true, payload: { changeProposal: await service.getFlowChangeProposal(String(payload.projectId ?? ""), String(payload.flowId ?? ""), String(payload.proposalId ?? "")) } };
    }
  });
}
