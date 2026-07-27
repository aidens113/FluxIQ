import type { JsonObject } from "../../../core";
import type { ComputeCommand, ComputeControlSnapshot } from "../types";

export const COMPUTE_CONTROL_ENDPOINTS = {
  snapshot: "snapshot",
  command: "command"
} as const;

export type ComputeControlCommandRequest = {
  targetComputeId: string;
  kind: ComputeCommand["kind"];
  payload?: JsonObject;
};

export type ComputeControlSnapshotResponse = ComputeControlSnapshot;
