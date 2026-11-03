import { createHash } from "node:crypto";

/** Canonical JSON preserves every array order and rejects values JSON would silently discard. */
export function automationStudioAcceptedStateDigest(value: unknown): { json: string; digest: string } {
  const ancestors = new Set<object>();
  const json = encode(value, ancestors, 0);
  if (Buffer.byteLength(json, "utf8") > 32 * 1024 * 1024) throw new Error("staged_authority.payload_too_large");
  return { json, digest: `sha256:${createHash("sha256").update(json, "utf8").digest("hex")}` };
}
function encode(value: unknown, ancestors: Set<object>, depth: number): string {
  if (depth > 128) throw new Error("staged_authority.payload_depth_invalid");
  if (value === null || typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number" && Number.isFinite(value)) return JSON.stringify(value);
  if (!value || typeof value !== "object" || ancestors.has(value)) throw new Error("staged_authority.payload_not_json");
  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      for (let index = 0; index < value.length; index++) if (!Object.hasOwn(value, index)) throw new Error("staged_authority.payload_not_json");
      return `[${value.map(entry => encode(entry, ancestors, depth + 1)).join(",")}]`;
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null || Reflect.ownKeys(value).length !== Object.keys(value).length) throw new Error("staged_authority.payload_not_json");
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${encode((value as Record<string, unknown>)[key], ancestors, depth + 1)}`).join(",")}}`;
  } finally { ancestors.delete(value); }
}
