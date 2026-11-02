import type { JsonObject } from "../../core.js";

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
