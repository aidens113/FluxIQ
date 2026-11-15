import type { AppRouteResourceInput } from "../../app-route-iam";

type ResourceSnapshot = { ok: true; value: AppRouteResourceInput } | { ok: false; error: string };

/** Detaches nested resource references from caller mutation and accepts only plain data. */
export function snapshotRouteResources(input: AppRouteResourceInput): ResourceSnapshot {
  try {
    const cloned: unknown = structuredClone(input);
    if (!cloned || typeof cloned !== "object" || Array.isArray(cloned)) return invalidResources();
    return { ok: true, value: freezeData(cloned, new Set()) as AppRouteResourceInput };
  } catch {
    return invalidResources();
  }
}

function invalidResources(): ResourceSnapshot {
  return { ok: false, error: "Request resources could not be verified." };
}

function freezeData(value: unknown, ancestors: Set<object>): unknown {
  if (value === null || typeof value !== "object") return value;
  if (ancestors.has(value)) throw new TypeError("Cyclic route resources are not supported.");
  const prototype = Object.getPrototypeOf(value);
  if (!Array.isArray(value) && prototype !== Object.prototype && prototype !== null) throw new TypeError("Route resources must be plain data.");
  ancestors.add(value);
  for (const child of Object.values(value)) freezeData(child, ancestors);
  ancestors.delete(value);
  return Object.freeze(value);
}
