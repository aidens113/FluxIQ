// The columns a read's rows carry: what a stored run dataset would hold. What a
// read mints afresh each time (`$` keys, handles, evidence) is not a column
// (`engine/automation/lifecycle-run/act-identity.ts` leaves the same out).
import { AUTOMATION_STUDIO_RECORD_SCHEMA_LIMITS } from "@fluxiq/contracts/automation";
import type { JsonObject } from "../../../../../core/index.ts";

const MINTED_FIELD = /^\$|handle|evidence/iu;

/** The columns the rows carry, in first-seen order, left out the minted ones and any key a schema cannot hold. */
export function automationStudioAnswerFirstReadColumns(rows: readonly JsonObject[]): string[] {
  const columns: string[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (seen.has(key) || MINTED_FIELD.test(key) || !AUTOMATION_STUDIO_RECORD_SCHEMA_LIMITS.fieldIdPattern.test(key)) continue;
      if ((AUTOMATION_STUDIO_RECORD_SCHEMA_LIMITS.reservedFieldIds as readonly string[]).includes(key)) continue;
      seen.add(key);
      columns.push(key);
    }
  }
  return columns;
}
