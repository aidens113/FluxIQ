import type { ClientGatewaySnapshot } from "./client-model";

export type ClientGatewayResult<T = unknown> = {
  ok: boolean;
  payload?: T;
  error?: string;
};

export type ClientGatewayApi = {
  get<T>(action: string): Promise<ClientGatewayResult<T>>;
  post<T = unknown>(action: string, body: Record<string, unknown>): Promise<ClientGatewayResult<T>>;
};

export type ClientGatewayPort = {
  querySnapshot(): Promise<ClientGatewayResult<ClientGatewaySnapshot>>;
  startRecording(input: { sessionId: string; projectId: string | null; authorizationPin: string }): Promise<ClientGatewayResult<{ recording?: { recordingId?: string } }>>;
  stopRecording(input: { sessionId: string; authorizationPin: string }): Promise<ClientGatewayResult<{ recording?: { recordingId?: string } }>>;
  captureSnapshot(sessionId: string): Promise<ClientGatewayResult>;
  executeAction(input: { sessionId: string; authorizationPin: string; command: Record<string, unknown> }): Promise<ClientGatewayResult<{ result?: { status?: string } }>>;
  revokeTrust(input: { trustedClientId: string; authorizationPin: string }): Promise<ClientGatewayResult>;
  resolvePairing(pairingCode: string, action: "approve" | "reject"): Promise<{ ok: boolean; error?: string }>;
};