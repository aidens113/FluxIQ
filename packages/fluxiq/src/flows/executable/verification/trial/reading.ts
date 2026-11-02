import type { TrialCollection } from "./collection.ts";

/**
 * One reading of a witness's place, before or after a trial: where it came
 * from (the ledger's latest read while still current, a look Core took, the
 * end view's read, or the acting step's own diff, read just before and just
 * after that step: t787), its location, the complete list groups it carried, its
 * controls (place -> state token -> count), and, on an after reading, the
 * domain's readable differences from the before reading.
 */

export type TrialReading = {
  source: "latest_read" | "core_look" | "end_view" | "step_diff";
  location?: string;
  collections?: TrialCollection[];
  controls?: Record<string, Record<string, number>>;
  lines?: { gone: string[]; added: string[] };
};
