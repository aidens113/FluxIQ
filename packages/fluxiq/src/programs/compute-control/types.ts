import type { JsonObject } from "../../core/index.ts";

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
  status?: "queued" | "claimed" | "succeeded" | "failed";
  payload?: JsonObject;
  createdAtMs: number;
  claimedAtMs?: number;
  completedAtMs?: number;
  result?: JsonObject;
  error?: string;
};

export type ComputeLease = {
  id: string;
  computeId: string;
  holder: string;
  purpose: string;
  expiresAtMs: number;
};

export type ComputeControlSnapshot = {
  nodes: ComputeNode[];
  commands: ComputeCommand[];
  leases: ComputeLease[];
};
