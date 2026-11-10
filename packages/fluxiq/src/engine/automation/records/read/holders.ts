// The objects a read's answer says things about the read in: the object holding its rows and each object the rows'
// path runs through, the nearer first (`result.extracted` is held by `result`, which the answer holds). Where a domain
// puts what it says of the read beside the rows (the page it read, what its conditions left out), Core finds it on
// these and nowhere else (`./location.ts`, `./left-out.ts`).
import type { JsonObject, JsonValue } from "../../../../core/index.ts";

export function automationStudioRecordReadHolders(answer: JsonValue | undefined, recordsPath: readonly string[]): JsonObject[] {
  const holders: JsonValue[] = [];
  let current = answer;
  for (const segment of recordsPath.slice(0, -1)) {
    holders.unshift(current ?? null);
    current = isRecord(current) && Object.hasOwn(current, segment) ? current[segment] : undefined;
  }
  holders.unshift(current ?? null);
  return holders.filter(isRecord);
}

function isRecord(value: JsonValue | undefined): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
