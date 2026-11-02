import type { TrialReading } from "./reading.ts";

/** A witness's reading as the judge sees it: counts only, never a token. */

export type TrialSiteSide = "unread" | { source: TrialReading["source"]; rows: number } | { source: TrialReading["source"]; state: Record<string, number> };
