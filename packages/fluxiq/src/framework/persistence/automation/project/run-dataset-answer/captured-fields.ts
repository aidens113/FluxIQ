/**
 * The field ids a batch's own read captured, as stored at write time (t998), or `undefined` for a batch written before
 * migration 0041 (or a row whose batch is missing): its captured fields are unknown, and its rows' absent cells stay
 * missing evidence. Nothing is inferred from other batches or from values. The store writes this column itself, so a
 * stored value that is not a list of ids is corruption, and it fails closed rather than reading as unknown.
 */
export function automationStudioRunDatasetCapturedFields(stored: string | null | undefined): string[] | undefined {
  if (stored === null || stored === undefined) return undefined;
  const parsed: unknown = JSON.parse(stored);
  if (!Array.isArray(parsed) || !parsed.every((field) => typeof field === "string")) throw new Error("Invalid run dataset batch captured fields.");
  return parsed;
}
