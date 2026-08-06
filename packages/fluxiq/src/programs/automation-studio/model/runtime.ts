import type { JsonObject } from "../../../core/index.ts";
import type { EvidenceReference } from "./evidence.ts";
import type { AutomationStudioFlowDocument } from "./artifacts.ts";
import type { AutomationStudioGraphExecutionTrace } from "../runtime/executor.ts";

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

export type AutomationStudioRuntimeSessionStatus =
  | "queued"
  | "running"
  | "waiting"
  | "succeeded"
  | "failed"
  | "cancelled";

export type AutomationStudioRuntimeSession = {
  schemaVersion: "0.1";
  runId: string;
  projectId?: string | null;
  targetKind: "task" | "routine" | "flow";
  targetId: string;
  flowId: string;
  status: AutomationStudioRuntimeSessionStatus;
  queuedAt: number;
  startedAt?: number;
  finishedAt?: number;
  flow: AutomationStudioFlowDocument;
  trace?: AutomationStudioGraphExecutionTrace;
  metadata?: JsonObject;
};
