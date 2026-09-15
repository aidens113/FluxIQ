import { createHash } from "node:crypto";
import { storedAutomationStudioRecordSchema, type AutomationStudioRecordSchema } from "@fluxiq/contracts/automation-studio";
import { stableJson } from "../stable-json.ts";

/**
 * The digest a run dataset stores beside its schema: `sha256:` and the hex
 * SHA-256 of the stable JSON of the stored schema. `exclude` fields are removed
 * first and object keys are sorted, so neither an excluded field nor key order
 * changes it, and within one run the store refuses a batch whose digest differs.
 */
export function automationStudioRecordSchemaDigest(schema: AutomationStudioRecordSchema): string {
  return `sha256:${createHash("sha256").update(stableJson(storedAutomationStudioRecordSchema(schema))).digest("hex")}`;
}
