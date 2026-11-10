// The address a read's answer says it read, so a record batch can say which page its rows came from.
//
// A domain's answer to a read holds the page it read beside the rows: a `location`, or the `url` of
// the `snapshot` it took of the page. Core reads those two names, in the answer and in the object the
// rows' path runs through (`result.extracted` is held by `result`), and nothing else: no address is
// no evidence, and the batch then carries none. Only a string that is a whole address is taken.
import type { JsonObject, JsonValue } from "../../../core/index.ts";

export function automationStudioRecordReadLocation(answer: JsonValue | undefined, recordsPath: readonly string[]): string | undefined {
  const holders: JsonValue[] = [];
  let current = answer;
  for (const segment of [...recordsPath.slice(0, -1)]) {
    holders.unshift(current ?? null);
    current = isRecord(current) && Object.hasOwn(current, segment) ? current[segment] : undefined;
  }
  holders.unshift(current ?? null);
  for (const holder of holders) {
    if (!isRecord(holder)) continue;
    const snapshot = holder.snapshot;
    for (const said of [holder.location, isRecord(snapshot) ? snapshot.url : undefined]) if (typeof said === "string" && said !== "" && URL.canParse(said)) return said;
  }
  return undefined;
}

function isRecord(value: JsonValue | undefined): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
