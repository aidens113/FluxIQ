import { createHash } from "node:crypto";

/** Private exact-retry identity, including the original declaration and safe row payload, never raw excluded values. */
export function automationStudioRunDatasetBatchReceipt(input: { schema: unknown; process: unknown; rows: readonly string[]; label: string | null; nodeId: string; attemptId: string; invalidCount: number; truncated: boolean; evidence: unknown }): string {
  const declaration = { ...input, rows: input.rows.map((row) => JSON.parse(row) as unknown) };
  const canonical = JSON.stringify(declaration, (_key, value: unknown) => value !== null && typeof value === "object" && !Array.isArray(value)
    ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, (value as Record<string, unknown>)[key]])) : value);
  return `sha256:${createHash("sha256").update(canonical).digest("hex")}`;
}
