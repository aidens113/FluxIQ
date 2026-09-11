import type { JsonObject } from "../../../../core/index.ts";
import type { ClientGatewayActionCommand } from "../../../../client-gateway/index.ts";

export type RevokeClientTrustRequest = {
  trustedClientId: string;
  reason?: string;
};

export type StartClientRecordingRequest = {
  sessionId: string;
  projectId?: string | null;
  taskId?: string;
  recordingId?: string;
  metadata?: JsonObject;
};

export type StopClientRecordingRequest = {
  sessionId: string;
};

export type CaptureClientSnapshotRequest = {
  sessionId: string;
  kind?: string;
  metadata?: JsonObject;
};

export type ExecuteClientActionRequest = {
  sessionId: string;
  command: ClientGatewayActionCommand;
};
