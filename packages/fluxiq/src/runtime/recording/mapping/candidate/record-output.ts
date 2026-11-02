import { parseAutomationStudioRecordOutput, type AutomationStudioRecordOutput } from "@fluxiq/contracts/records";
import type { RecordingMappingIo } from "../io.ts";
import { RecordingCandidateValidationError } from "./error.ts";

/** A present invalid record schema rejects the action instead of widening saved data. */
export function recordingCandidateRecordOutput(io: RecordingMappingIo, domainId: string, outputId: string, value: unknown): AutomationStudioRecordOutput | undefined {
  if (value === undefined || value === null) return undefined;
  let declared: unknown;
  try {
    declared = structuredClone(value);
  } catch {
    throw RecordingCandidateValidationError.recordOutput(outputId, ["record_output.invalid"]);
  }
  const parsed = parseAutomationStudioRecordOutput(withOutputRecordsPath(io, domainId, outputId, declared));
  if (!parsed.ok) throw RecordingCandidateValidationError.recordOutput(outputId, parsed.issues);
  return parsed.output;
}

function withOutputRecordsPath(io: RecordingMappingIo, domainId: string, outputId: string, declared: unknown): unknown {
  if (!declared || typeof declared !== "object" || Object.getPrototypeOf(declared) !== Object.prototype) return declared;
  const record = declared as Record<string, unknown>;
  if (record.recordsPath !== undefined) return declared;
  const outputRecordsPath = io.getOutput(domainId, outputId)?.definition.metadata?.recordsPath;
  return typeof outputRecordsPath === "string" ? { ...record, recordsPath: outputRecordsPath } : declared;
}
