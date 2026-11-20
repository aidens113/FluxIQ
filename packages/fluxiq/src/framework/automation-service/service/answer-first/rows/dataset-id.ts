// A storage key for an already-declared source identity, never an inference about which list a read read.
// Preserve ordinary ids; encode an id the dataset contract cannot store using its digest, keeping the original
// source/step id whole in the private page provenance. No row, instruction, target or call parameter is hashed.
import { createHash } from "node:crypto";
import { AUTOMATION_STUDIO_RECORD_OUTPUT_LIMITS } from "@fluxiq/contracts/automation";

export function automationStudioAnswerFirstStoredDatasetId(kind: "read" | "step", source: string, version?: number): string {
  const suffix = version === undefined ? "" : `.v${version}`;
  const literal = `${kind}.${source}${suffix}`;
  return AUTOMATION_STUDIO_RECORD_OUTPUT_LIMITS.datasetIdPattern.test(literal) ? literal : `${kind}.id-${createHash("sha256").update(source).digest("hex")}${suffix}`;
}
