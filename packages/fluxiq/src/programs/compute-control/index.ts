import type { JsonObject } from "../../core";

export type ComputeStatus = "offline" | "connecting" | "online" | "busy" | "paused" | "error";

export type ComputeNode = {
  id: string;
  label: string;
  status: ComputeStatus;
  host?: string;
  domainIds: string[];
  capabilities: string[];
  lastHeartbeatMs?: number;
  metadata?: JsonObject;
};

export type ComputeCommand = {
  id: string;
  targetComputeId: string;
  kind: "start_flow" | "stop_flow" | "pause" | "resume" | "custom";
  payload?: JsonObject;
  createdAtMs: number;
};

export type ComputeLease = {
  id: string;
  computeId: string;
  holder: string;
  purpose: string;
  expiresAtMs: number;
};
