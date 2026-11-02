import type { AutomationStudioActionDeclarationRecord } from "../../../flows/executable/permissions/index.ts";
import type { AutomationStudioActionConsequence } from "../../../components/automation/action-effect/consequences/index.ts";
import { automationStudioConsequencesInOrder } from "../../../components/automation/action-effect/consequences/index.ts";

/** Every class any of these actions declared, deduplicated and in Core's order. */
export function automationStudioDeclaredConsequences(
  records: readonly AutomationStudioActionDeclarationRecord[]
): AutomationStudioActionConsequence[] {
  return automationStudioConsequencesInOrder(records.flatMap((record) => record.consequences));
}
