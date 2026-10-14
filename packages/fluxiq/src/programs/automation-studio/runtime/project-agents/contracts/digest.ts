import { createHash } from "node:crypto";

// The digest every project-agent contract is bound by: SHA-256 over canonical
// JSON (object keys sorted, arrays in order) of the value and a version tag, so
// two contracts of different kinds never share a digest by accident. Values are
// parsed before they are digested, so they are plain JSON here.

export function automationStudioProjectDigest(version: string, value: unknown): string {
  return createHash("sha256").update(canonical({ version, value })).digest("hex");
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).filter(([, item]) => item !== undefined);
    return `{${entries.sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0)).map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}
