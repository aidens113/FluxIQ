// Flow instructions, their instruction sets, and the change proposals raised
// against them.

import { authorizeProgramPin } from "../../../_shared/authorization.ts";
import { AUTOMATION_STUDIO_ENDPOINTS, type FlowChangeProposalRequest, type FlowExpansionSummaryRequest, type FlowInstructionRequest, type FlowInstructionSetRequest, type SaveFlowInstructionRequest } from "../contracts.ts";
import type { AutomationStudioFlowInstruction, AutomationStudioInstructionTag } from "../../model/index.ts";
import type { AutomationStudioService } from "../../runtime/index.ts";
import { flowInstructionScopeFromPayload } from "./instruction-scope.ts";
import type { AutomationStudioApiDependencies } from "./dependencies.ts";

export function registerInstructionEndpoints(dependencies: AutomationStudioApiDependencies): void {
  const { registry, service, identityAccess } = dependencies;
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.listFlowInstructions,
    permission: "programs.read",
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
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.getFlowInstruction,
    permission: "programs.read",
    handler: async (request) => {
      const payload = request.payload && typeof request.payload === "object" ? request.payload as FlowInstructionRequest : {} as FlowInstructionRequest;
      return { ok: true, payload: { instruction: await service.getFlowInstruction(String(payload.projectId ?? ""), String(payload.instructionId ?? "")) } };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.getFlowInstructionSet,
    permission: "programs.read",
    handler: async (request) => {
      const payload = request.payload && typeof request.payload === "object" ? request.payload as FlowInstructionSetRequest : {} as FlowInstructionSetRequest;
      const input: Parameters<AutomationStudioService["getFlowInstructionSet"]>[0] = { projectId: String(payload.projectId ?? "") };
      if (typeof payload.flowId === "string") input.flowId = payload.flowId;
      if (typeof payload.subflowId === "string") input.subflowId = payload.subflowId;
      return { ok: true, payload: { instructions: await service.getFlowInstructionSet(input) } };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.saveFlowInstruction,
    permission: "flows.write",
    handler: async (request) => {
      const payload = request.payload && typeof request.payload === "object" ? request.payload as SaveFlowInstructionRequest & { authSessionId?: unknown; authorizationPin?: unknown } : {} as SaveFlowInstructionRequest;
      await authorizeProgramPin(identityAccess, payload as any);
      const projectId = String(payload.projectId ?? "");
      const flowId = String(payload.flowId ?? "");
      const now = Date.now();
      const title = String(payload.title ?? "").trim();
      const body = String(payload.body ?? "").trim();
      if (!projectId || !flowId) return { ok: false, error: "Project and Flow are required." };
      if (!title || !body) return { ok: false, error: "Instruction title and body are required." };
      const existing = typeof payload.instructionId === "string" && payload.instructionId.trim()
        ? await service.getFlowInstruction(projectId, payload.instructionId.trim())
        : null;
      const instructionId = existing?.instructionId ?? payload.instructionId?.trim() ?? `instruction.${slugSegment(title)}.${now.toString(36)}`;
      const instruction: AutomationStudioFlowInstruction = {
        schemaVersion: "0.1",
        instructionId,
        title,
        body,
        scope: flowInstructionScopeFromPayload(projectId, flowId, payload),
        priority: Number.isFinite(Number(payload.priority)) ? Number(payload.priority) : existing?.priority ?? 50,
        status: payload.status === "disabled" || payload.status === "archived" ? payload.status : existing?.status ?? "active",
        requirement: payload.requirement === "required" ? "required" : "advisory",
        tags: Array.isArray(payload.tags) ? payload.tags.filter((tag): tag is AutomationStudioInstructionTag => typeof tag === "string" && ["generation", "runtime", "error", "router", "subflow", "review", "safety"].includes(tag)) : existing?.tags ?? [],
        linkedRunIds: existing?.linkedRunIds ?? [],
        linkedAdaptationIds: existing?.linkedAdaptationIds ?? [],
        linkedRecordingIds: existing?.linkedRecordingIds ?? [],
        linkedSubflowIds: existing?.linkedSubflowIds ?? [],
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
        metadata: existing?.metadata ?? {}
      };
      return { ok: true, payload: { instruction: await service.saveFlowInstruction(projectId, instruction) } };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.listFlowChangeProposals,
    permission: "programs.read",
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
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.getFlowChangeProposal,
    permission: "programs.read",
    handler: async (request) => {
      const payload = request.payload && typeof request.payload === "object" ? request.payload as FlowChangeProposalRequest : {} as FlowChangeProposalRequest;
      return { ok: true, payload: { changeProposal: await service.getFlowChangeProposal(String(payload.projectId ?? ""), String(payload.flowId ?? ""), String(payload.proposalId ?? "")) } };
    }
  });
}

function slugSegment(value: string): string {
  const slug = value.toLowerCase().replace(/[^a-z0-9]+/g, ".").replace(/^\.+|\.+$/g, "").slice(0, 48);
  return slug || "instruction";
}
