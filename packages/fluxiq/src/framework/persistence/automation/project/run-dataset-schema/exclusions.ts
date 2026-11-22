import { createHash } from "node:crypto";
import type { AutomationStudioRecordSchema } from "@fluxiq/contracts/automation";

/** Private, complete exclusion policy: no excluded field ID or value reaches persistence. */
export function automationStudioRunDatasetExclusions(schema: AutomationStudioRecordSchema, previous: string | null | undefined): string | null {
  const digest = (id: string): string => createHash("sha256").update("fluxiq.record-field-exclusion\0").update(id).digest("hex");
  const incoming = schema.fields.filter((field) => field.handling === "exclude").map((field) => digest(field.id));
  if (previous === undefined) return JSON.stringify([...new Set(incoming)].sort());
  if (previous === null) return null;
  const parsed: unknown = JSON.parse(previous);
  if (!Array.isArray(parsed) || !parsed.every((value) => typeof value === "string" && /^[0-9a-f]{64}$/u.test(value))) throw new Error("Invalid run dataset exclusion policy.");
  const excluded = new Set<string>(parsed);
  if (schema.fields.some((field) => field.handling !== "exclude" && excluded.has(digest(field.id)))) throw new Error("Run dataset schema exclusion conflict.");
  return JSON.stringify([...new Set([...excluded, ...incoming])].sort());
}
