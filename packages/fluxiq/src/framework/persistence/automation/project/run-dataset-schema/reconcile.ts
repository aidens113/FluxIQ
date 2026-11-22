import { createHash } from "node:crypto";
import { mergeAutomationStudioRecordSchemas, parseAutomationStudioRecordSchema, storedAutomationStudioRecordSchema, type AutomationStudioRecordSchema } from "@fluxiq/contracts/automation";
import { automationStudioRunDatasetExclusions } from "./exclusions.ts";

/** Atomic append metadata: additive pages and stale batch digests retain the same dataset and batch identities. */
export function reconcileAutomationStudioRunDatasetSchema(input: {
  schema: unknown;
  schemaDigest: unknown;
  existing?: { schema_json: string; schema_digest: string; excluded_field_digests_json: string | null } | undefined;
  startsOver?: boolean;
}): { schema: AutomationStudioRecordSchema; schemaDigest: string; excludedFieldDigestsJson: string | null } {
  const parsed = parseAutomationStudioRecordSchema(input.schema);
  if (!parsed.ok) throw new Error(`Invalid run dataset schema: ${parsed.issues.join(", ")}`);
  if (typeof input.schemaDigest !== "string" || !/^[A-Za-z0-9._:-]{1,200}$/u.test(input.schemaDigest)) throw new Error("Invalid run dataset schema digest.");
  const excludedFieldDigestsJson = automationStudioRunDatasetExclusions(parsed.schema, input.startsOver ? undefined : input.existing ? input.existing.excluded_field_digests_json ?? null : undefined);
  if (!input.existing || input.startsOver) return { schema: storedAutomationStudioRecordSchema(parsed.schema), schemaDigest: input.schemaDigest, excludedFieldDigestsJson };
  const earlier = parseAutomationStudioRecordSchema(JSON.parse(input.existing.schema_json));
  if (!earlier.ok) throw new Error("Invalid stored run dataset schema.");
  if (excludedFieldDigestsJson === null && parsed.schema.fields.some((field) => field.handling !== "exclude" && !earlier.schema.fields.some((old) => old.id === field.id))) throw new Error("Run dataset exclusion policy unknown; restart before schema growth.");
  const merged = mergeAutomationStudioRecordSchemas(earlier.schema, parsed.schema);
  if (!merged.ok) throw new Error(`Run dataset schema conflict: ${merged.issues.join(", ")}`);
  const schema = storedAutomationStudioRecordSchema(merged.schema);
  const serialized = JSON.stringify(schema);
  return {
    schema,
    excludedFieldDigestsJson,
    schemaDigest: serialized === JSON.stringify(earlier.schema) ? input.existing.schema_digest
      : `sha256:${createHash("sha256").update(serialized).digest("hex")}`
  };
}
