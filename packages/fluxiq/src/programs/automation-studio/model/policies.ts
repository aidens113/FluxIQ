import type { JsonObject } from "../../../core/index.ts";
import type { PolicyAction } from "./actions.ts";
import type { AutomationConditionGroup } from "./conditions.ts";
import type { AutomationStudioSchemaVersion, EvidenceReference, GeneratedMetadata } from "./evidence.ts";

export type TimeoutPolicy = {
  timeoutMs: number;
  settleMs?: number;
};

export type RetryPolicy = {
  maxAttempts: number;
  backoffMs?: number;
};

export type RecoveryPolicy = {
  strategy:
    | "pause"
    | "rescore_nodes"
    | "retry_previous"
    | "restart_policy"
    | "invoke_assistant"
    | "custom";
  maxRecoveryAttempts?: number;
  metadata?: JsonObject;
};

export type PolicyEdge = {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  label?: string;
  condition?: AutomationConditionGroup;
  probability?: number;
  metadata?: JsonObject;
};

export type Expectation = {
  id: string;
  label: string;
  kind: "success" | "failure" | "readiness" | "invariant" | "exit";
  conditions: AutomationConditionGroup;
  sourceEvidence: EvidenceReference[];
  confidence?: number;
  metadata?: JsonObject;
};

export type PolicyNode = {
  id: string;
  label: string;
  description?: string;
  eligibility: AutomationConditionGroup;
  actions: PolicyAction[];
  successConditions: AutomationConditionGroup;
  failureConditions?: AutomationConditionGroup;
  readinessConditions?: AutomationConditionGroup;
  invariants?: AutomationConditionGroup;
  timeout: TimeoutPolicy;
  retry: RetryPolicy;
  recovery: RecoveryPolicy;
  outgoingEdges: PolicyEdge[];
  expectations?: Expectation[];
  sourceEvidence: EvidenceReference[];
  generatedMetadata: GeneratedMetadata;
  metadata?: JsonObject;
};

export type PolicyGraph = {
  schemaVersion: AutomationStudioSchemaVersion;
  policyId: string;
  taskId: string;
  version: string;
  nodes: PolicyNode[];
  edges: PolicyEdge[];
  sourceEvidence: EvidenceReference[];
  generatedMetadata: GeneratedMetadata;
  metadata?: JsonObject;
};
