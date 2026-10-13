// A read step's own parameters: the step's, or the one object inside them that
// holds what a read is authored with -- a condition list, a paging setting, a
// dedupe setting, a column map. The key the domain puts them under is the
// domain's to name, so the object is found by what it holds (`./accounts.ts`).

import type { JsonObject } from "../../../../../core/index.ts";

/** The members that mark an object as a read's own parameters. */
const READ_PARAMETER_KEYS = ["where", "paginate", "dedupe", "fields"];

/** The read's own parameters, or `undefined` when no object in reach holds any. */
export function automationStudioResultReadParameters(parameters: JsonObject | undefined): JsonObject | undefined {
  if (!parameters) return undefined;
  const candidates = [parameters, ...Object.values(parameters).filter(isRecord)];
  return candidates.find((candidate) => READ_PARAMETER_KEYS.some((key) => Object.hasOwn(candidate, key)));
}

function isRecord(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
