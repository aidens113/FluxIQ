// Everything routed through a paired client: its snapshot and item listings,
// trust revocation, recording control, snapshots and action execution.

import { authorizeProgramPin } from "../../../_shared/authorization.ts";
import { AUTOMATION_STUDIO_ENDPOINTS, type CaptureClientSnapshotRequest, type ExecuteClientActionRequest, type RevokeClientTrustRequest, type StartClientRecordingRequest, type StopClientRecordingRequest } from "../contracts.ts";
import { automationStudioFilterHash, automationStudioPageLimit, decodeAutomationStudioPageCursor, encodeAutomationStudioPageCursor } from "../../storage/index.ts";
import type { AutomationStudioApiDependencies } from "./dependencies.ts";

export function registerClientGatewayEndpoints(dependencies: AutomationStudioApiDependencies): void {
  const { registry, service, identityAccess, clientGatewayBridge, clientGateway } = dependencies;
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.clientGatewaySnapshot,
    permission: "programs.read",
    handler: async () => {
      await clientGateway?.ready();
      const summary = clientGateway?.summary() ?? { enabled: false, counts: { sessions: 0, pairings: 0, trustedClients: 0 } };
      return {
        ok: true,
        payload: { ...summary, sessions: [], pairings: [], trustedClients: [], auditLog: [] }
      };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.listClientGatewayItems,
    permission: "programs.read",
    handler: async (request) => {
      await clientGateway?.ready();
      const payload = request.payload && typeof request.payload === "object" ? request.payload as Record<string, unknown> : {};
      const kind = payload.kind === "pairings" || payload.kind === "trustedClients" ? payload.kind : "sessions";
      const search = typeof payload.search === "string" ? payload.search.trim().toLowerCase() : "";
      const limit = automationStudioPageLimit(payload.limit, 50);
      const owner = `client-gateway:${kind}`;
      const filterHash = automationStudioFilterHash({ search });
      const cursor = decodeAutomationStudioPageCursor<{ id: string }>(payload.cursor, { owner, filterHash, validate: (values) => typeof values.id === "string" && values.id.length > 0 });
      const page = clientGateway?.listSummaryItems({ kind, afterId: cursor?.id ?? null, limit, search }) ?? { items: [], total: 0, limit, lastId: null, hasMore: false };
      const nextCursor = page.hasMore && page.lastId ? encodeAutomationStudioPageCursor({ owner, filterHash, values: { id: page.lastId } }) : null;
      return { ok: true, payload: { items: page.items, page: { total: page.total, limit: page.limit, nextCursor, hasMore: page.hasMore } } };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.revokeClientTrust,
    permission: "runtime.control",
    handler: async (request) => {
      if (!clientGateway) return { ok: false, error: "Client gateway is not available." };
      const payload = (request.payload && typeof request.payload === "object" ? request.payload : {}) as RevokeClientTrustRequest & { authSessionId?: unknown; authorizationPin?: unknown };
      await authorizeProgramPin(identityAccess, payload);
      const revoked = await clientGateway.revokeTrustedClient(String(payload.trustedClientId ?? ""), payload.reason?.trim() || "revoked by operator");
      return revoked ? { ok: true, payload: { revoked: true } } : { ok: false, error: "Trusted client was not found or was already revoked." };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.startClientRecording,
    permission: "runtime.control",
    handler: async (request) => {
      if (!clientGatewayBridge) return { ok: false, error: "Client gateway bridge is not available." };
      const payload = (request.payload && typeof request.payload === "object" ? request.payload : {}) as StartClientRecordingRequest & { authSessionId?: unknown; authorizationPin?: unknown };
      await authorizeProgramPin(identityAccess, payload);
      return { ok: true, payload: { recording: await clientGatewayBridge.startRecording(payload) } };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.stopClientRecording,
    permission: "runtime.control",
    handler: async (request) => {
      if (!clientGatewayBridge) return { ok: false, error: "Client gateway bridge is not available." };
      const payload = (request.payload && typeof request.payload === "object" ? request.payload : {}) as StopClientRecordingRequest & { authSessionId?: unknown; authorizationPin?: unknown };
      await authorizeProgramPin(identityAccess, payload);
      const recording = await clientGatewayBridge.stopRecording(String(payload.sessionId ?? ""));
      return { ok: true, payload: { recording: recording ? service.summarizeRecordingSession(recording) : null } };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.captureClientSnapshot,
    permission: "runtime.control",
    handler: async (request) => {
      if (!clientGateway) return { ok: false, error: "Client gateway is not available." };
      const payload = (request.payload && typeof request.payload === "object" ? request.payload : {}) as CaptureClientSnapshotRequest;
      await clientGateway.captureSnapshot(String(payload.sessionId ?? ""), {
        ...(payload.kind !== undefined ? { kind: payload.kind } : {}),
        ...(payload.metadata !== undefined ? { metadata: payload.metadata } : {})
      });
      return { ok: true, payload: { queued: true } };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.executeClientAction,
    permission: "runtime.control",
    handler: async (request) => {
      if (!clientGatewayBridge) return { ok: false, error: "Client gateway bridge is not available." };
      const payload = (request.payload && typeof request.payload === "object" ? request.payload : {}) as ExecuteClientActionRequest & { authSessionId?: unknown; authorizationPin?: unknown };
      await authorizeProgramPin(identityAccess, payload);
      return { ok: true, payload: { result: await clientGatewayBridge.executeAction(String(payload.sessionId ?? ""), payload.command) } };
    }
  });
}
