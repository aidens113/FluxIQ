import { createHash } from "node:crypto";
import type { AutomationStudioSubflowCardCheck } from "@fluxiq/contracts/automation";
import type { AutomationStudioFactCondition } from "../../automation-host/contracts/index.ts";
import { canonicalPartJson } from "./canonical-json.ts";

/**
 * A check as a card holds it: the digest of its conditions and how many there
 * are, with a line a person reads. Undefined for no conditions. The conditions
 * themselves stay in the version's snapshot, where a guard reads them.
 */
export function partCheckOf(conditions: readonly AutomationStudioFactCondition[], says: string): AutomationStudioSubflowCardCheck | undefined {
  if (conditions.length === 0) return undefined;
  return { digest: createHash("sha256").update(canonicalPartJson(conditions)).digest("hex"), conditions: conditions.length, says };
}
