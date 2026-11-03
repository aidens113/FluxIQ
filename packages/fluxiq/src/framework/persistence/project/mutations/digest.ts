import { createHash } from "node:crypto";
import { stableStringify } from "./serialization.ts";

export function automationStudioMutationDigest(value: unknown): string {
  return `sha256:${createHash("sha256").update(stableStringify(value)).digest("hex")}`;
}
