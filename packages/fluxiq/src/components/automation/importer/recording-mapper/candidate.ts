import type { JsonObject } from "../../../../core/index.ts";
import type { AutomationStudioRecordOutput } from "@fluxiq/contracts/records";
export type AutomationStudioRecordingMapperCandidate = {
  outputId: string;
  parameters?: JsonObject;
  sourceObservationIds?: string[];
  sourceInputIds?: string[];
  expectedConfirmation?: {
    inputId: string;
    timeoutMs?: number;
    description?: string;
  };
  /** What should hold after the action, in the condition shape the host's expectation evaluator reads. Kept only when it is a plain object. */
  expectedState?: JsonObject;
  /**
   * The records this action's output returns, to save as a dataset. `recordsPath`
   * may be left out when the domain output declares `metadata.recordsPath`. Core
   * parses it and rejects the candidate when it is invalid or asks to encrypt a
   * field; `null` proposes no record output.
   */
  recordOutput?: Omit<AutomationStudioRecordOutput, "recordsPath"> & {
    recordsPath?: string;
  };
  /** How long the recorded action is given, in whole milliseconds above zero; the action's 5,000 ms default when absent. Any other value rejects the candidate. */
  timeoutMs?: number;
  confidence?: number;
  evidence?: Array<{
    layer: "recording" | "normalized_timeline" | "evidence";
    artifactId: string;
    entryId?: string;
    observationId?: string;
  }>;
  label?: string;
  description?: string;
};
