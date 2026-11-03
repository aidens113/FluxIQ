/**
 * The name a written name resolved to, and how much of that resolution was a
 * guess. A caller reports `how` back to the model and to the run record, so a
 * corrected name is visible rather than silently substituted.
 */
export type AutomationStudioNameMatch = {
  id: string;
  /** `exact` = the id verbatim; `normalized` = equal after normalising; `nearest` = a scored guess. */
  how: "exact" | "normalized" | "nearest";
  /** 0..1. A `nearest` below the floor is not returned at all. */
  score: number;
};
