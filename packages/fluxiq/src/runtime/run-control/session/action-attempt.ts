import type { EvidenceReference } from "@fluxiq/contracts/recording";
import type { JsonObject } from "../../../core/index.ts";

export type RuntimeActionAttempt = {
  attemptId: string;
  nodeId: string;
  actionId: string;
  proposedAt: number;
  dispatchedAt?: number;
  settledAt?: number;
  preStateFingerprint: string;
  postStateFingerprint?: string;
  status: "proposed" | "dispatched" | "succeeded" | "failed" | "timed_out" | "cancelled";
  evidence: EvidenceReference[];
  metadata?: JsonObject;
};
