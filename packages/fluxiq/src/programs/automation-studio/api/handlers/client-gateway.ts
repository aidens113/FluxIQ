// Everything routed through a paired client: its snapshot and item listings,
// trust revocation, recording control, snapshots and action execution.

import { clientGatewaySnapshotInput, listClientGatewayItemsInput, revokeClientTrustInput } from "@fluxiq/contracts/program-api-inputs";
import { endpointResource } from "../../../_shared/iam/index.ts";
import { AUTOMATION_STUDIO_ENDPOINTS, type CaptureClientSnapshotRequest, type ExecuteClientActionRequest, type RevokeClientTrustRequest, type StartClientRecordingRequest, type StopClientRecordingRequest } from "../../../../api-contracts/automation.ts";
import { automationStudioFilterHash, automationStudioPageLimit, decodeAutomationStudioPageCursor, encodeAutomationStudioPageCursor } from "../../../../framework/persistence/automation/index.ts";
import type { AutomationStudioApiDependencies } from "./dependencies.ts";

export function registerClientGatewayEndpoints(dependencies: AutomationStudioApiDependencies): void {
  const { registry, service, clientGatewayBridge, clientGateway } = dependencies;
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.clientGatewaySnapshot,
    assistant: { input: clientGatewaySnapshotInput, summary: "Shows how many browsers are connected, paired and trusted.", phrases: ["is my browser connected", "how many browsers are connected"] },
    permission: "programs.read",
    classification: "read",
    action: "studio:ClientGatewaySnapshot",
    accessLevel: "Read",
    resource: endpointResource.workspace(),
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
    assistant: { input: listClientGatewayItemsInput, summary: "Lists the connected browsers, waiting pairing requests or trusted browsers.", phrases: ["show my connected browsers", "which browsers are trusted"] },
    permission: "programs.read",
    classification: "read",
    action: "studio:ListClientGatewayItems",
    accessLevel: "List",
    resource: endpointResource.workspace(),
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
    assistant: { input: revokeClientTrustInput, summary: "Stops trusting a browser.", phrases: ["stop trusting this browser", "remove a trusted browser"], target: { trustedClientId: "trusted browser" } },
    permission: "runtime.control",
    classification: "authoring",
    action: "studio:RevokeClientTrust",
    accessLevel: "Write",
    resource: endpointResource.workspace(),
    handler: async (request) => {
      if (!clientGateway) return { ok: false, error: "Client gateway is not available." };
      const payload = (request.payload && typeof request.payload === "object" ? request.payload : {}) as RevokeClientTrustRequest & { authSessionId?: unknown; authorizationPin?: unknown };
      const revoked = await clientGateway.revokeTrustedClient(String(payload.trustedClientId ?? ""), payload.reason?.trim() || "revoked by operator");
      return revoked ? { ok: true, payload: { revoked: true } } : { ok: false, error: "Trusted client was not found or was already revoked." };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.startClientRecording,
    assistant: { hidden: "The browser starts its own recording and tells FluxIQ; a person does not know its session ids." },
    permission: "runtime.control",
    classification: "authoring",
    action: "studio:StartClientRecording",
    accessLevel: "Write",
    resource: endpointResource.workspace(),
    handler: async (request) => {
      if (!clientGatewayBridge) return { ok: false, error: "Client gateway bridge is not available." };
      const payload = (request.payload && typeof request.payload === "object" ? request.payload : {}) as StartClientRecordingRequest & { authSessionId?: unknown; authorizationPin?: unknown };
      return { ok: true, payload: { recording: await clientGatewayBridge.startRecording(payload) } };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.stopClientRecording,
    assistant: { hidden: "The browser stops its own recording and tells FluxIQ; a person does not know its session ids." },
    permission: "runtime.control",
    classification: "authoring",
    action: "studio:StopClientRecording",
    accessLevel: "Write",
    resource: endpointResource.workspace(),
    handler: async (request) => {
      if (!clientGatewayBridge) return { ok: false, error: "Client gateway bridge is not available." };
      const payload = (request.payload && typeof request.payload === "object" ? request.payload : {}) as StopClientRecordingRequest & { authSessionId?: unknown; authorizationPin?: unknown };
      const recording = await clientGatewayBridge.stopRecording(String(payload.sessionId ?? ""));
      return { ok: true, payload: { recording: recording ? service.summarizeRecordingSession(recording) : null } };
    }
  });
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.captureClientSnapshot,
    assistant: { hidden: "This is sent between FluxIQ and a connected browser to capture a page; only a client process uses it." },
    permission: "runtime.control",
    classification: "authoring",
    action: "studio:CaptureClientSnapshot",
    accessLevel: "Write",
    resource: endpointResource.workspace(),
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
    assistant: { hidden: "This runs a raw command in a connected browser; only a client process sends it." },
    permission: "runtime.control",
    classification: "destructive",
    action: "studio:ExecuteClientAction",
    accessLevel: "Write",
    resource: endpointResource.workspace(),
    handler: async (request) => {
      if (!clientGatewayBridge) return { ok: false, error: "Client gateway bridge is not available." };
      const payload = (request.payload && typeof request.payload === "object" ? request.payload : {}) as ExecuteClientActionRequest & { authSessionId?: unknown; authorizationPin?: unknown };
      return { ok: true, payload: { result: await clientGatewayBridge.executeAction(String(payload.sessionId ?? ""), payload.command) } };
    }
  });
}
