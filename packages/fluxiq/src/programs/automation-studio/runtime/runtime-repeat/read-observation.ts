import type { AutomationStudioRuntimeRepeatObservation } from "./observation.ts";

const unreadable = { kind: "unavailable", reason: "unreadable" } as const;

/** Closed descriptor-only reader: no host getter, error prose or arbitrary field is consumed. */
export function automationStudioReadRuntimeRepeatObservation(value: unknown): AutomationStudioRuntimeRepeatObservation {
  try {
    const fields = record(value);
    if (!fields) return unreadable;
    if (fields.kind === "unavailable" && keys(fields, ["kind", "reason"])) {
      const reason = fields.reason;
      if (reason === "missing" || reason === "partial" || reason === "unreadable" || reason === "unsupported") return { kind: "unavailable", reason };
    }
    if (fields.kind !== "observed" || fields.coverage !== "complete" || !keys(fields, ["kind", "coverage", "resource", "target", "viewDigest"]) || !token(fields.resource) || !token(fields.viewDigest)) return unreadable;
    const target = record(fields.target);
    if (target?.kind === "none" && keys(target, ["kind"])) return { kind: "observed", coverage: "complete", resource: fields.resource, target: { kind: "none" }, viewDigest: fields.viewDigest };
    if (target?.kind === "identified" && keys(target, ["kind", "key"]) && token(target.key)) return { kind: "observed", coverage: "complete", resource: fields.resource, target: { kind: "identified", key: target.key }, viewDigest: fields.viewDigest };
    return unreadable;
  } catch {
    return unreadable;
  }
}

function record(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const prototype: unknown = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return undefined;
  const own = Reflect.ownKeys(value);
  if (own.length > 5 || own.some(key => typeof key !== "string")) return undefined;
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const result: Record<string, unknown> = Object.create(null);
  for (const key of own) {
    if (typeof key !== "string") return undefined;
    const descriptor = descriptors[key]!;
    if (!descriptor.enumerable || !Object.hasOwn(descriptor, "value")) return undefined;
    result[key] = descriptor.value;
  }
  return result;
}

function keys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const actual = Object.keys(value);
  return actual.length === expected.length && actual.every(key => expected.includes(key));
}

function token(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 256;
}
