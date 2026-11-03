import type { JsonObject } from "../../../core/index.ts";
import { RecordingIngressShapes as S } from "./shape.ts";

/** Passive structured target data; no domain fields gain executable meaning. */
export function isOpaqueRecordingTarget(value: unknown): value is JsonObject & { type: string } {
  return S.jsonObject(value) && typeof value.type === "string";
}
