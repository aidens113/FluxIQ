export type ClientActionKind = "start" | "stop" | "execute" | "revoke";

export type ClientCapability = {
  actionTypes?: readonly string[];
};

export type ClientSession = {
  sessionId: string;
  name?: string;
  clientType?: string;
  status?: string;
  activeRecordingId?: string;
  lastSeenAt?: number | string;
  capabilities?: readonly ClientCapability[];
};

export type ClientPairing = {
  pairingCode: string;
  referenceCode?: string;
  consumedAt?: number | string;
  requestedByClientName?: string;
  expiresAt?: number | string;
};

export type TrustedClient = {
  trustedClientId: string;
  name: string;
  status: string;
  approvedAt?: number | string;
  expiresAt?: number | string;
};

export type ClientGatewaySnapshot = {
  enabled: boolean;
  sessions: ClientSession[];
  pairings: ClientPairing[];
  trustedClients: TrustedClient[];
  auditLog: unknown[];
  publicUrl?: string;
  webRuntime?: {
    clientGatewayPublicUrl?: string;
    clientGatewayListening?: boolean;
    clientGatewayError?: string;
    hostModuleLoaded?: boolean;
    automationStudio?: {
      nativeImporterRuntimeBound?: boolean;
      nativeNodeDefinitionCount?: number;
      recordingMapperCount?: number;
    };
  };
};

export const emptyClientGatewaySnapshot: ClientGatewaySnapshot = {
  enabled: false,
  sessions: [],
  pairings: [],
  trustedClients: [],
  auditLog: []
};

export function clientAuthorizationCopy(kind: ClientActionKind) {
  if (kind === "start") return { title: "Start client recording", description: "Authorize a new recording for the selected connected client.", action: "Start recording" };
  if (kind === "stop") return { title: "Stop client recording", description: "Finalize the selected client's active recording as Flow evidence.", action: "Stop recording" };
  if (kind === "execute") return { title: "Send client action", description: "Authorize the configured test action on the selected connected client.", action: "Send action" };
  return { title: "Revoke client trust", description: "Disconnect this trusted client and require a new pairing approval before it can reconnect.", action: "Revoke trust" };
}

export function uniqueClientActionTypes(session: Pick<ClientSession, "capabilities"> | undefined): string[] {
  return Array.from(new Set<string>((session?.capabilities ?? []).flatMap((capability) => capability.actionTypes ?? [])));
}

export function retainSelectedSession(sessions: ReadonlyArray<Pick<ClientSession, "sessionId">>, currentId: string): string {
  return sessions.some((session) => session.sessionId === currentId) ? currentId : sessions[0]?.sessionId ?? "";
}

export type ClientSelectionLocation = "none" | "visible" | "checking" | "off-page" | "missing";

export function clientSelectionLocation(input: { selectedSessionId: string; visibleSessions: ReadonlyArray<Pick<ClientSession, "sessionId">>; pinnedSessionId?: string | null; verifiedExists?: boolean | null }): ClientSelectionLocation {
  if (!input.selectedSessionId) return "none";
  if (input.visibleSessions.some((session) => session.sessionId === input.selectedSessionId)) return "visible";
  if (input.pinnedSessionId !== input.selectedSessionId) return "missing";
  if (input.verifiedExists === true) return "off-page";
  if (input.verifiedExists === false) return "missing";
  return "checking";
}

export function buildClientCommand(actionType: string, selector: string, text: string) {
  const parameters: Record<string, unknown> = {};
  if (selector.trim()) parameters.selector = selector.trim();
  if (text) parameters.text = text;
  return {
    actionType,
    parameters,
    timeoutMs: 10_000,
    ...(selector.trim() ? { target: { type: "selector", selector: selector.trim() } } : {})
  };
}
