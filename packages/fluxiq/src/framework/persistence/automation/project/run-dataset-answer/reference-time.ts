/** Read execution metadata, never re-date carried captures from the current clock. Plain saved-Flow runs use their own actual first start. */
export function automationStudioRunDatasetProcessingReference(run: { started_at_ms: number | null; summary_json: string } | undefined): number | undefined {
  if (!run) return undefined;
  let summary: unknown;
  try { summary = JSON.parse(run.summary_json); }
  catch { return undefined; }
  if (!summary || typeof summary !== "object" || Array.isArray(summary)) return undefined;
  const metadata = (summary as Record<string, unknown>).metadata;
  if (metadata !== undefined && (!metadata || typeof metadata !== "object" || Array.isArray(metadata))) return undefined;
  const record = metadata as Record<string, unknown> | undefined;
  const reference = record && Object.hasOwn(record, "processingReferenceTimeMs") ? record.processingReferenceTimeMs
    : record && Object.hasOwn(record, "explorationAttempt") ? undefined : run.started_at_ms;
  return typeof reference === "number" && Number.isSafeInteger(reference) && reference >= 0 ? reference : undefined;
}
