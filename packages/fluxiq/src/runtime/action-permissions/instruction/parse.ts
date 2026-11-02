import type { AutomationStudioInstructedConsequence } from "../../../flows/executable/permissions/index.ts";
import { isRecord } from "./record.ts";
import { isAutomationStudioActionConsequence } from "../../../components/automation/action-effect/consequences/index.ts";
import { permissionConstants } from "./constants.ts";
const { MAX_QUOTE, MIN_QUOTE, ID, DIGEST } = permissionConstants;

export function parseEntry(value: unknown): AutomationStudioInstructedConsequence | null {
  if (!isRecord(value) || Object.keys(value).some((key) => !["consequence", "instructionId", "instructionDigest", "quote"].includes(key))) return null;
  if (!isAutomationStudioActionConsequence(value.consequence) || typeof value.instructionId !== "string" || !ID.test(value.instructionId)
    || typeof value.instructionDigest !== "string" || !DIGEST.test(value.instructionDigest)
    || typeof value.quote !== "string" || value.quote.length < MIN_QUOTE || value.quote.length > MAX_QUOTE) return null;
  return { consequence: value.consequence, instructionId: value.instructionId, instructionDigest: value.instructionDigest, quote: value.quote };
}
