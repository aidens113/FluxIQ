import type { JsonObject } from "../../../core/index.ts";

export type NodeStateSourceKind = "learned" | "observed" | "runtime";

export type NodeStateSource =
  | {
      kind: "learned";
      id: string;
      label: string;
      modelId?: string;
      nodeId: string;
      recordingIds: string[];
      confidence?: number;
      metadata?: JsonObject;
    }
  | {
      kind: "observed";
      id: string;
      label: string;
      recordingId: string;
      timelineEntryId?: string;
      timestamp: number;
      metadata?: JsonObject;
    }
  | {
      kind: "runtime";
      id: string;
      label: string;
      sessionId?: string;
      timestamp: number;
      metadata?: JsonObject;
    };

export type NodeStatePhase =
  | "input"
  | "action"
  | "expected_output"
  | "actual_output";

export type NodeStateViewSelection = {
  sourceId?: string;
  phase?: NodeStatePhase;
  metadata?: JsonObject;
};

export type NodeStateRuntimeComparison = {
  expectedSourceId: string;
  actualSourceId: string;
  nodeId: string;
  phase: "actual_output";
  matches: Array<{
    evidenceId: string;
    factPath: string;
    score?: number;
  }>;
  mismatches: Array<{
    evidenceId: string;
    factPath: string;
    expected: unknown;
    actual: unknown;
    severity: "warning" | "error";
  }>;
  confidence?: number;
  metadata?: JsonObject;
};

export const initialNodeStatePhases: NodeStatePhase[] = ["input", "action", "expected_output"];
