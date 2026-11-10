import { canonicalJson, type DataFieldPath } from "@fluxiq/contracts/fluxnode";
import type { JsonObject } from "../../../../../core/index.ts";
import { readField } from "../expression/index.ts";

/** The text that identifies a record by the values at `paths`: equal keys mean equal values. */
export function keyOf(data: JsonObject, paths: readonly DataFieldPath[]): string {
  return canonicalJson(paths.map((path) => readField(data, path)));
}
