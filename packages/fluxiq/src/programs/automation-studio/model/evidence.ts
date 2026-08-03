import type { JsonObject } from "../../../core";

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

export type GeneratedMetadata = {
  generatedBy: "user" | "assistant" | "signal_miner" | "runtime_trainer" | "import" | "migration";
  generatedAt: number;
  model?: string;
  promptId?: string;
  confidence?: number;
  metadata?: JsonObject;
};
