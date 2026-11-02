import { createHash } from "node:crypto";

export function digest(parts: readonly (string | number)[]): string {
  return createHash("sha256").update(parts.join("\n"), "utf8").digest("hex").slice(0, 16);
}
