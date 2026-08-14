import type { JsonObject } from "../../../core/index.ts";
import type { EvidenceAnchor, StatePresentationMetadata, StateValue } from "./state.ts";

export type AutomationStudioSchemaVersion = "0.1";

export type EvidenceLayer =
  | "raw_recording"
  | "normalized_timeline"
  | "signal_mining"
  | "evidence_fact"
  | "evidence_observation"
  | "state_action_correlation"
  | "evidence_claim"
  | "learned_task_model"
  | "policy_graph"
  | "runtime_execution";

export type EvidenceReference = {
  layer: EvidenceLayer;
  artifactId: string;
  entryId?: string;
  signalPath?: string;
  noteId?: string;
  relationship?: string;
  confidence?: number;
  metadata?: JsonObject;
};

export type StateFactReference = {
  snapshotId?: string;
  namespace: string;
  path: string;
  observedAt?: number;
  evidence?: EvidenceReference;
};

export type StateFact = StateFactReference & {
  id?: string;
  value?: StateValue;
  confidence?: number;
  anchor?: EvidenceAnchor;
  presentation?: StatePresentationMetadata;
  metadata?: JsonObject;
};

export type NodeEvidenceRole =
  | "eligibility"
  | "negative_eligibility"
  | "readiness"
  | "expectation"
  | "failure"
  | "context"
  | "invariant"
  | "ignored";

export type EvidenceComparator =
  | { kind: "exists" }
  | { kind: "equals"; value: unknown }
  | { kind: "not_equals"; value: unknown }
  | { kind: "numeric"; operator: ">" | ">=" | "<" | "<=" | "==" | "!="; value: number }
  | { kind: "changed" }
  | { kind: "custom"; comparatorId: string; parameters?: JsonObject };

export type NodeEvidenceBinding = {
  id: string;
  nodeId: string;
  fact: StateFactReference;
  role: NodeEvidenceRole;
  comparator: EvidenceComparator;
  expectedValue?: unknown;
  weight?: number;
  confidence?: number;
  anchor?: EvidenceAnchor;
  provenance?: EvidenceReference[];
  metadata?: JsonObject;
};

export type GeneratedMetadata = {
  generatedBy: "user" | "assistant" | "signal_miner" | "runtime_trainer" | "import" | "migration";
  generatedAt: number;
  model?: string;
  promptId?: string;
  confidence?: number;
  metadata?: JsonObject;
};
