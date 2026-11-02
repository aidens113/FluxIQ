import type { JsonObject, JsonValue } from "../../../core/index.ts";
import type { RecordingIngressGuard } from "./guard.ts";

/** Typed structural decoding; no wire object is asserted into a richer contract. */
export class RecordingIngressShapes {
  static string(value: unknown): value is string { return typeof value === "string"; }
  static number(value: unknown): value is number { return typeof value === "number" && Number.isFinite(value); }
  static boolean(value: unknown): value is boolean { return typeof value === "boolean"; }
  static unknown(_value: unknown): _value is unknown { return true; }
  static record(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === "object" && !Array.isArray(value); }
  static nullableString(value: unknown): value is string | null { return value === null || typeof value === "string"; }
  static optional<T>(guard: RecordingIngressGuard<T>): RecordingIngressGuard<T | undefined> { return (value): value is T | undefined => value === undefined || guard(value); }
  static array<T>(guard: RecordingIngressGuard<T>): RecordingIngressGuard<T[]> { return (value): value is T[] => Array.isArray(value) && value.every(guard); }
  static dictionary<T>(guard: RecordingIngressGuard<T>): RecordingIngressGuard<Record<string, T>> { return (value): value is Record<string, T> => RecordingIngressShapes.record(value) && Object.values(value).every(guard); }
  static oneOf<T extends string | number | boolean | null>(...values: T[]): RecordingIngressGuard<T> { return (value): value is T => values.some(candidate => candidate === value); }
  static object<T extends object>(fields: { [K in keyof Required<T>]: RecordingIngressGuard<T[K]> }): RecordingIngressGuard<T> {
    return (value): value is T => {
      if (!RecordingIngressShapes.record(value)) return false;
      for (const key in fields) if (!fields[key](value[key])) return false;
      return true;
    };
  }
  static jsonObject(value: unknown): value is JsonObject { return RecordingIngressShapes.record(value) && RecordingIngressShapes.jsonValue(value, new Set()); }
  private static jsonValue(value: unknown, seen: Set<object>): value is JsonValue {
    if (value === null || typeof value === "string" || typeof value === "boolean") return true;
    if (typeof value === "number") return Number.isFinite(value);
    if (!value || typeof value !== "object" || seen.has(value)) return false;
    seen.add(value);
    const valid = (Array.isArray(value) ? value : Object.values(value)).every(item => RecordingIngressShapes.jsonValue(item, seen));
    seen.delete(value);
    return valid;
  }
}
