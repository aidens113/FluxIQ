import type { JsonObject } from "../../../../../core/index.ts";
import { isRecord } from "./record.ts";
import { isJsonValue } from "./value.ts";



export function isJsonObject(value: unknown): value is JsonObject {
  return isRecord(value) && isJsonValue(value);
}
