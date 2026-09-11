// The flow router: its summary and route listings, and the flow-map route,
// group and fallback mutations.

import { authorizeProgramPin } from "../../../_shared/authorization.ts";
import { AUTOMATION_STUDIO_ENDPOINTS, type DeleteFlowMapRouteGroupRequest, type DeleteFlowMapRouteRequest, type FlowIdProjectRequest, type MutateFlowMapRouteRequest, type SaveFlowMapFallbackRequest, type SaveFlowMapRouteGroupRequest, type SaveFlowMapRouteRequest, type TestFlowMapRouteConditionRequest } from "../contracts.ts";
import { evaluateAutomationStudioRouteCondition, type AutomationStudioService } from "../../runtime/index.ts";
import type { AutomationStudioApiDependencies } from "./dependencies.ts";

export function registerRouterEndpoints(dependencies: AutomationStudioApiDependencies): void {
  const { registry, service, identityAccess } = dependencies;
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.getFlowRouter,
    permission: "programs.read",
    handler: async (request) => {
      const payload = request.payload && typeof request.payload === "object" ? request.payload as FlowIdProjectRequest : {} as FlowIdProjectRequest;
      return { ok: true, payload: { router: await service.getFlowRouter(String(payload.projectId ?? ""), String(payload.flowId ?? "")) } };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.getFlowRouterSummary,
    permission: "programs.read",
    handler: async (request) => {
      const payload = request.payload && typeof request.payload === "object" ? request.payload as FlowIdProjectRequest : {} as FlowIdProjectRequest;
      return { ok: true, payload: { router: await service.getFlowRouterSummary(String(payload.projectId ?? ""), String(payload.flowId ?? "")) } };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.listFlowRouterRoutes,
    permission: "programs.read",
    handler: async (request) => {
      const payload = request.payload && typeof request.payload === "object" ? request.payload as Record<string, unknown> : {};
      const page = await service.listFlowRouterRoutes({
        projectId: String(payload.projectId ?? ""),
        flowId: String(payload.flowId ?? ""),
        ...(typeof payload.groupId === "string" || payload.groupId === null ? { groupId: payload.groupId as string | null } : {}),
        ...(payload.status === "active" || payload.status === "disabled" ? { status: payload.status } : {}),
        ...(typeof payload.search === "string" ? { search: payload.search } : {}),
        limit: payload.limit,
        cursor: payload.cursor
      });
      return { ok: true, payload: { routes: page.routes, groups: page.groups, page } };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.listFlowRouterTargetReferences,
    permission: "programs.read",
    handler: async (request) => {
      const payload = request.payload && typeof request.payload === "object" ? request.payload as Record<string, unknown> : {};
      const subflowIds = Array.isArray(payload.subflowIds) ? payload.subflowIds.filter((value): value is string => typeof value === "string") : [];
      const batch = await service.listFlowRouterTargetReferences({
        projectId: String(payload.projectId ?? ""),
        flowId: String(payload.flowId ?? ""),
        subflowIds,
        perTargetLimit: payload.perTargetLimit
      });
      return { ok: true, payload: { targets: batch.targets, batch } };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.getFlowRouterGraphSummary,
    permission: "programs.read",
    handler: async (request) => {
      const payload = request.payload && typeof request.payload === "object" ? request.payload as Record<string, unknown> : {};
      return { ok: true, payload: { graph: await service.getFlowRouterGraphSummary({
        projectId: String(payload.projectId ?? ""),
        flowId: String(payload.flowId ?? ""),
        ...(typeof payload.groupId === "string" || payload.groupId === null ? { groupId: payload.groupId as string | null } : {}),
        ...(payload.status === "active" || payload.status === "disabled" ? { status: payload.status } : {}),
        ...(typeof payload.search === "string" ? { search: payload.search } : {}),
        limit: payload.limit,
        cursor: payload.cursor
      }) } };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.saveFlowMapRouteGroup,
    permission: "flows.write",
    handler: async (request) => {
      const payload = request.payload && typeof request.payload === "object" ? request.payload as SaveFlowMapRouteGroupRequest & { authSessionId?: unknown; authorizationPin?: unknown } : {} as SaveFlowMapRouteGroupRequest;
      await authorizeProgramPin(identityAccess, payload as any);
      const input: Parameters<AutomationStudioService["upsertFlowMapRouteGroup"]>[0] = { projectId: String(payload.projectId ?? ""), flowId: String(payload.flowId ?? ""), name: String(payload.name ?? "") };
      if (typeof payload.groupId === "string") input.groupId = payload.groupId;
      if (typeof payload.description === "string") input.description = payload.description;
      input.order = payload.order;
      if (typeof payload.status === "string") input.status = payload.status as any;
      if (typeof payload.collapsed === "boolean") input.collapsed = payload.collapsed;
      return { ok: true, payload: { router: await service.upsertFlowMapRouteGroup(input) } };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.deleteFlowMapRouteGroup,
    permission: "flows.write",
    handler: async (request) => {
      const payload = request.payload && typeof request.payload === "object" ? request.payload as DeleteFlowMapRouteGroupRequest & { authSessionId?: unknown; authorizationPin?: unknown } : {} as DeleteFlowMapRouteGroupRequest;
      await authorizeProgramPin(identityAccess, payload as any);
      return { ok: true, payload: { router: await service.deleteFlowMapRouteGroup({ projectId: String(payload.projectId ?? ""), flowId: String(payload.flowId ?? ""), groupId: String(payload.groupId ?? "") }) } };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.saveFlowMapRoute,
    permission: "flows.write",
    handler: async (request) => {
      const payload = request.payload && typeof request.payload === "object" ? request.payload as SaveFlowMapRouteRequest & { authSessionId?: unknown; authorizationPin?: unknown } : {} as SaveFlowMapRouteRequest;
      await authorizeProgramPin(identityAccess, payload as any);
      const input: Parameters<AutomationStudioService["upsertFlowMapRoute"]>[0] = { projectId: String(payload.projectId ?? ""), flowId: String(payload.flowId ?? ""), name: String(payload.name ?? ""), targetSubflowId: String(payload.targetSubflowId ?? "") };
      if (typeof payload.ruleId === "string") input.ruleId = payload.ruleId;
      if (typeof payload.description === "string") input.description = payload.description;
      input.order = payload.order;
      if (typeof payload.status === "string") input.status = payload.status as any;
      if (typeof payload.groupId === "string" || payload.groupId === null) input.groupId = payload.groupId;
      if (typeof payload.setAsFallback === "boolean") input.setAsFallback = payload.setAsFallback;
      input.confidence = payload.confidence;
      if (typeof payload.conditionSummary === "string") input.conditionSummary = payload.conditionSummary;
      if (typeof payload.conditionSignalPath === "string") input.conditionSignalPath = payload.conditionSignalPath;
      if (typeof payload.conditionOperator === "string") input.conditionOperator = payload.conditionOperator;
      if (payload.conditionExpected !== undefined) input.conditionExpected = payload.conditionExpected;
      if (typeof payload.clearCondition === "boolean") input.clearCondition = payload.clearCondition;
      return { ok: true, payload: { router: await service.upsertFlowMapRoute(input) } };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.saveFlowMapFallback,
    permission: "flows.write",
    handler: async (request) => {
      const payload = request.payload && typeof request.payload === "object" ? request.payload as SaveFlowMapFallbackRequest & { authSessionId?: unknown; authorizationPin?: unknown } : {} as SaveFlowMapFallbackRequest;
      await authorizeProgramPin(identityAccess, payload as any);
      return { ok: true, payload: { router: await service.setFlowMapFallback({
        projectId: String(payload.projectId ?? ""),
        flowId: String(payload.flowId ?? ""),
        kind: payload.kind === "subflow" ? "subflow" : "fail",
        ...(typeof payload.targetSubflowId === "string" ? { targetSubflowId: payload.targetSubflowId } : {}),
        ...(typeof payload.message === "string" ? { message: payload.message } : {})
      }) } };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.testFlowMapRouteCondition,
    permission: "programs.read",
    handler: async (request) => {
      const payload = request.payload && typeof request.payload === "object" ? request.payload as TestFlowMapRouteConditionRequest : {} as TestFlowMapRouteConditionRequest;
      const condition = payload.condition && typeof payload.condition.signalPath === "string" ? payload.condition as any : undefined;
      return { ok: true, payload: evaluateAutomationStudioRouteCondition(condition, { ...(payload.inputs ? { inputs: payload.inputs as any } : {}), ...(payload.currentStateSummary ? { currentStateSummary: payload.currentStateSummary as any } : {}) }) };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.mutateFlowMapRoute,
    permission: "flows.write",
    handler: async (request) => {
      const payload = request.payload && typeof request.payload === "object" ? request.payload as MutateFlowMapRouteRequest & { authSessionId?: unknown; authorizationPin?: unknown } : {} as MutateFlowMapRouteRequest;
      await authorizeProgramPin(identityAccess, payload as any);
      const action = ["move_up", "move_down", "duplicate", "toggle", "delete"].includes(payload.action) ? payload.action : "toggle";
      return { ok: true, payload: { router: await service.mutateFlowMapRoute({ projectId: String(payload.projectId ?? ""), flowId: String(payload.flowId ?? ""), ruleId: String(payload.ruleId ?? ""), action }) } };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.deleteFlowMapRoute,
    permission: "flows.write",
    handler: async (request) => {
      const payload = request.payload && typeof request.payload === "object" ? request.payload as DeleteFlowMapRouteRequest & { authSessionId?: unknown; authorizationPin?: unknown } : {} as DeleteFlowMapRouteRequest;
      await authorizeProgramPin(identityAccess, payload as any);
      return { ok: true, payload: { router: await service.deleteFlowMapRoute({ projectId: String(payload.projectId ?? ""), flowId: String(payload.flowId ?? ""), ruleId: String(payload.ruleId ?? "") }) } };
    }
  });
}
