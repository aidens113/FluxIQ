import { cellOf, cellText } from "./cell-text.ts";
import { automationStudioRecordRowIdentity } from "./row-identity.ts";

/** An incomplete key falls back to the full original, never a projection or virtual value. */
export function automationStudioRecordAutomaticIdentity(values: Readonly<Record<string, unknown>>, original: Readonly<Record<string, unknown>>, key: readonly string[], storedFields: readonly string[]): string | undefined {
  if (key.length && key.every((field) => cellText(cellOf(values, field)) !== undefined)) {
    const identity = automationStudioRecordRowIdentity(values, key);
    if (identity !== undefined) return JSON.stringify(["key", identity]);
  }
  const whole = automationStudioRecordRowIdentity(original, storedFields);
  return whole === undefined ? undefined : JSON.stringify(["row", whole]);
}
