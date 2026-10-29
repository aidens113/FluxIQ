// Flow runs with their actions and events, and the adaptations reviewed
// against them.
//
// No endpoint here asserts the project's domain scope, and that is deliberate
// rather than an omission to copy either way. A run record carries structure
// and counts only: its captured rows became a `$dataset` marker, its input
// values the withheld marker, its capture result the same. The rows themselves
// live behind `datasets.ts`, where every endpoint does assert. Before adding
// an endpoint here that returns content a run captured, read the rule pinned
// in `tests/domain-scope.test.ts` — it decides which side a new endpoint
// belongs on.

import { endpointResource } from "../../../_shared/iam/index.ts";
import { AUTOMATION_STUDIO_ENDPOINTS, type FlowAdaptationRequest, type FlowExpansionSummaryRequest, type FlowRunActionPageRequest, type FlowRunDetailRequest, type FlowRunEventPageRequest, type FlowSpendRequest, type FlowSpendResponse, type ReviewFlowAdaptationRequest } from "../contracts.ts";
import { automationStudioWithWholeAttemptInputs, type AutomationStudioService } from "../../runtime/index.ts";
import type { AutomationStudioApiDependencies } from "./dependencies.ts";

export function registerRunEndpoints(dependencies: AutomationStudioApiDependencies): void {
  const { registry, service } = dependencies;
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.listFlowRuns,
    permission: "programs.read",
    classification: "read",
    action: "studio:ListFlowRuns",
    accessLevel: "List",
    resource: endpointResource.project(),
    handler: async (request) => {
      const payload = request.payload && typeof request.payload === "object" ? request.payload as FlowExpansionSummaryRequest : {} as FlowExpansionSummaryRequest;
      const input: Parameters<AutomationStudioService["listFlowRunSummaries"]>[0] = { projectId: String(payload.projectId ?? ""), limit: payload.limit, offset: payload.offset };
      if (typeof payload.flowId === "string") input.flowId = payload.flowId;
      if (typeof payload.status === "string") input.status = payload.status;
      if (typeof payload.search === "string") input.search = payload.search;
      if (payload.sort === "updated" || payload.sort === "started" || payload.sort === "duration" || payload.sort === "actions" || payload.sort === "status") input.sort = payload.sort;
      if (payload.direction === "asc" || payload.direction === "desc") input.direction = payload.direction;
      const listed = await service.listFlowRunSummaries(input);
      // Every run answers whether it changed the Flow; a summary saved before
      // the field existed never recorded that it did.
      const runs = listed.runs.map((run) => ({ ...run, durableBehaviorChanged: run.durableBehaviorChanged === true }));
      return { ok: true, payload: { runs, page: { ...listed, runs } } };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.getFlowRunDetail,
    permission: "programs.read",
    classification: "read",
    action: "studio:GetFlowRunDetail",
    accessLevel: "Read",
    resource: endpointResource.projectChild("run", "runId"),
    handler: async (request) => {
      const payload = request.payload && typeof request.payload === "object" ? request.payload as FlowRunDetailRequest : {} as FlowRunDetailRequest;
      const runDetail = await service.getFlowRunDetail(String(payload.projectId ?? ""), String(payload.runId ?? ""), { includeCollections: payload.compact !== true });
      // A repair's `completedTrace` is a saved trace; a client reads its attempts' whole inputs (t377).
      return { ok: true, payload: { runDetail: automationStudioWithWholeAttemptInputs(runDetail) } };
    }
  });
  // A Flow's spend, read-only (t728): what its Lab-scoped Flow purse recorded
  // (`runtime/service/creation-spend.ts`) -- dollars, builds and calls, by
  // phase and agent role, and the largest call input -- which the Lab used to
  // rebuild from the step log. Numbers only, so
  // like a run record it asserts no domain scope. `{ spend: null }` for a Flow
  // with no record.
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.getFlowSpend,
    permission: "programs.read",
    classification: "read",
    action: "studio:GetFlowSpend",
    accessLevel: "Read",
    resource: endpointResource.projectChild("flow", "flowId"),
    handler: async (request) => {
      const payload = request.payload && typeof request.payload === "object" ? request.payload as FlowSpendRequest : {} as FlowSpendRequest;
      const record = await service.creationSpends.get(String(payload.projectId ?? ""), String(payload.flowId ?? ""));
      const answer: FlowSpendResponse = {
        spend: record ? {
          projectId: record.projectId,
          flowId: record.flowId,
          spentUsd: record.spentUsd,
          builds: record.builds,
          calls: record.calls ?? null,
          byPhase: record.byPhase ? structuredClone(record.byPhase) : null,
          largestInputTokens: record.largestInputTokens ?? null,
          byRole: record.byRole ? structuredClone(record.byRole) : null,
          createdAt: record.createdAt,
          updatedAt: record.updatedAt
        } : null
      };
      return { ok: true, payload: answer };
    }
  });
  // Runtime Debug's Export Audit button reads `payload.audit`; an unknown run
  // answers `{ audit: null }` rather than an error, as run detail does.
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.exportFlowRunAudit,
    permission: "programs.read",
    classification: "read",
    action: "studio:ExportFlowRunAudit",
    accessLevel: "Read",
    resource: endpointResource.projectChild("run", "runId"),
    handler: async (request) => {
      const payload = request.payload && typeof request.payload === "object" ? request.payload as FlowRunDetailRequest : {} as FlowRunDetailRequest;
      const audit = await service.exportFlowRunAudit(String(payload.projectId ?? ""), String(payload.runId ?? ""));
      return { ok: true, payload: { audit: automationStudioWithWholeAttemptInputs(audit) } };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.listFlowRunActions,
    permission: "programs.read",
    classification: "read",
    action: "studio:ListFlowRunActions",
    accessLevel: "List",
    resource: endpointResource.projectChild("run", "runId"),
    handler: async (request) => {
      const payload = request.payload && typeof request.payload === "object" ? request.payload as FlowRunActionPageRequest : {} as FlowRunActionPageRequest;
      const page = await service.listFlowRunActions({ projectId: String(payload.projectId ?? ""), runId: String(payload.runId ?? ""), limit: payload.limit, offset: payload.offset, cursor: payload.cursor });
      return { ok: true, payload: { actions: page.actions, page } };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.getFlowRunActionDetail,
    permission: "programs.read",
    classification: "read",
    action: "studio:GetFlowRunActionDetail",
    accessLevel: "Read",
    resource: endpointResource.projectChild("run", "runId"),
    handler: async (request) => {
      const payload = request.payload && typeof request.payload === "object" ? request.payload as Record<string, unknown> : {};
      return { ok: true, payload: { action: await service.getFlowRunActionDetail({ projectId: String(payload.projectId ?? ""), runId: String(payload.runId ?? ""), attemptId: String(payload.attemptId ?? "") }) } };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.listFlowRunEvents,
    permission: "programs.read",
    classification: "read",
    action: "studio:ListFlowRunEvents",
    accessLevel: "List",
    resource: endpointResource.projectChild("run", "runId"),
    handler: async (request) => {
      const payload = request.payload && typeof request.payload === "object" ? request.payload as FlowRunEventPageRequest : {} as FlowRunEventPageRequest;
      const page = await service.listFlowRunEvents({ projectId: String(payload.projectId ?? ""), runId: String(payload.runId ?? ""), afterSequence: payload.afterSequence, cursor: payload.cursor, limit: payload.limit });
      return { ok: true, payload: { events: page.events, page } };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.getFlowRunEventDetail,
    permission: "programs.read",
    classification: "read",
    action: "studio:GetFlowRunEventDetail",
    accessLevel: "Read",
    resource: endpointResource.projectChild("run", "runId"),
    handler: async (request) => {
      const payload = request.payload && typeof request.payload === "object" ? request.payload as Record<string, unknown> : {};
      return { ok: true, payload: { event: await service.getFlowRunEventDetail({ projectId: String(payload.projectId ?? ""), runId: String(payload.runId ?? ""), sequence: payload.sequence }) } };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.listFlowAdaptations,
    permission: "programs.read",
    classification: "read",
    action: "studio:ListFlowAdaptations",
    accessLevel: "List",
    resource: endpointResource.project(),
    handler: async (request) => {
      const payload = request.payload && typeof request.payload === "object" ? request.payload as FlowExpansionSummaryRequest : {} as FlowExpansionSummaryRequest;
      const input: Parameters<AutomationStudioService["listFlowAdaptationSummaries"]>[0] = { projectId: String(payload.projectId ?? ""), limit: payload.limit, offset: payload.offset };
      if (typeof payload.flowId === "string") input.flowId = payload.flowId;
      if (typeof payload.subflowId === "string") input.subflowId = payload.subflowId;
      if (typeof payload.status === "string") input.status = payload.status;
      if (typeof payload.risk === "string") input.risk = payload.risk;
      if (typeof payload.search === "string") input.search = payload.search;
      if (payload.sort === "updated" || payload.sort === "status" || payload.sort === "risk" || payload.sort === "trigger") input.sort = payload.sort;
      if (payload.direction === "asc" || payload.direction === "desc") input.direction = payload.direction;
      const page = await service.listFlowAdaptationSummaries(input);
      return { ok: true, payload: { adaptations: page.adaptations, page } };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.getFlowAdaptation,
    permission: "programs.read",
    classification: "read",
    action: "studio:GetFlowAdaptation",
    accessLevel: "Read",
    resource: endpointResource.projectChild("flow", "flowId"),
    handler: async (request) => {
      const payload = request.payload && typeof request.payload === "object" ? request.payload as FlowAdaptationRequest : {} as FlowAdaptationRequest;
      return { ok: true, payload: { adaptation: await service.getFlowAdaptation(String(payload.projectId ?? ""), String(payload.flowId ?? ""), String(payload.adaptationId ?? "")) } };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.reviewFlowAdaptation,
    permission: "flows.write",
    classification: "authoring",
    action: "studio:ReviewFlowAdaptation",
    accessLevel: "Write",
    resource: endpointResource.projectChild("flow", "flowId"),
    handler: async (request) => {
      const payload = request.payload && typeof request.payload === "object" ? request.payload as ReviewFlowAdaptationRequest : {} as ReviewFlowAdaptationRequest;
      return {
        ok: true,
        payload: {
          adaptation: await service.reviewFlowAdaptation({
            projectId: String(payload.projectId ?? ""),
            flowId: String(payload.flowId ?? ""),
            adaptationId: String(payload.adaptationId ?? ""),
            action: payload.action,
            ...(request.actor?.userId ? { actorId: request.actor.userId } : {}),
            ...(payload.reason ? { reason: payload.reason } : {}),
            ...(payload.supersededByAdaptationId ? { supersededByAdaptationId: payload.supersededByAdaptationId } : {})
          })
        }
      };
    }
  });
}
