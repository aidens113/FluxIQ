// Which row an act was on, by the row's own fields (`design.md`): never its
// position, never a handle, never a value in the clear.

import type { JsonObject } from "../../../../core/index.ts";
import { automationStudioAttemptActDigest } from "./digest.ts";
import { automationStudioAttemptActOwnFields } from "./fields.ts";

/** The `sha256:` digest of a row's own fields, or none for a row holding nothing but what a read minted: such a row can be told from no other. */
export function automationStudioAttemptActRowIdentity(row: JsonObject): string | undefined {
  const fields = automationStudioAttemptActOwnFields(row) as Record<string, unknown>;
  if (Object.keys(fields).length === 0) return undefined;
  return `sha256:${automationStudioAttemptActDigest(fields)}`;
}
