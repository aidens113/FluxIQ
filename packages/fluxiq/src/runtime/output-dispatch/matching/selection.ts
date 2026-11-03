import type { JsonObject } from "../../../core/index.ts";
export type OutputTargetSelection = {
  candidateId: string;
  confidence: number;
  matchedSignals: string[];
  failedSignals: string[];
  metadata?: JsonObject;
};
