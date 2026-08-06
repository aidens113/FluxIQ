import type { JsonObject } from "../../../core/index.ts";
import type { ComputeCommand, ComputeControlSnapshot, ComputeNode, ComputeStatus } from "../types.ts";

export const COMPUTE_CONTROL_ENDPOINTS = {
  snapshot: "snapshot",
  registerNode: "register-node",
  heartbeat: "heartbeat",
  command: "command",
  pollCommands: "poll-commands",
  completeCommand: "complete-command",
  acquireLease: "acquire-lease",
  releaseLease: "release-lease"
} as const;

export type RegisterComputeNodeRequest = ComputeNode;

export type ComputeHeartbeatRequest = {
  nodeId: string;
  status?: ComputeStatus;
};

export type ComputeControlCommandRequest = {
  targetComputeId: string;
  kind: ComputeCommand["kind"];
  payload?: JsonObject;
};

export type PollComputeCommandsRequest = {
  nodeId: string;
  limit?: number;
};

export type CompleteComputeCommandRequest = {
  commandId: string;
  ok: boolean;
  result?: JsonObject;
  error?: string;
};

export type AcquireComputeLeaseRequest = {
  computeId: string;
  holder: string;
  purpose: string;
  ttlMs: number;
};

export type ReleaseComputeLeaseRequest = {
  leaseId: string;
};

export type ComputeControlSnapshotResponse = ComputeControlSnapshot;
