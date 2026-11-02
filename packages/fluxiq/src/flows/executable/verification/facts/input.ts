import type { ResultRequestedOutput } from "../requested-output/index.ts";
import type { RunResultSummary } from "../summary/index.ts";

/** What every fact is computed from: the summary the judge would be shown, the request, and what the build declared it owes. */

export type ResultComputedFactsInput = {
  summary: RunResultSummary;
  /** The request, as the Flow's own instructions state it (what `../request-rows/request-wording.ts` reads). */
  instructions: ReadonlyArray<{ title: string; body: string }>;
  /** The request's text: each instruction's title and body, joined by new lines, as `../verify.ts` builds it. */
  requestText: string;
  /** What the build declared it owes, where the caller holds it outside the summary's task checklist (t757). */
  requestedOutput?: ResultRequestedOutput | undefined;
};
