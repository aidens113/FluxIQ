import type { TrialSiteLines } from "./lines.ts";

/** A witness's change as the judge sees it. */

export type TrialSiteWitnessChange =
  | "unread"
  | "none"
  | { added: number; removed: number; changed: number; unchanged: number; lines?: TrialSiteLines }
  | { from: Record<string, number>; to: Record<string, number>; lines?: TrialSiteLines };
