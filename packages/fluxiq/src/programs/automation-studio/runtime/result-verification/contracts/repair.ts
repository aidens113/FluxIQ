/**
 * One thing wrong with what a run produced, as Core's own arithmetic found it.
 *
 * Coded, so a repair can act on it without reading prose, and ids only -- a
 * column id, a record set id -- because a value belongs to the person and a
 * count belongs to Core. `detail` is Core's sentence for a reader, never a
 * model's.
 */
export type AutomationStudioResultRepairFinding = {
  /** Core's stable code for this finding. */
  code: string;
  /** What was found, in Core's own words, bounded. */
  detail: string;
  /** The record set it is about, when it is about one. */
  datasetId?: string;
  /** The column ids it is about, bounded. Ids, never values. */
  columns?: string[];
};

/**
 * What to fix, and what the check itself said about it.
 *
 * The user's instruction of 2026-09-26: "judging answers: it should give
 * explicit instructions on what to fix regarding the data + possible
 * suggestions." Before this, a refutation was a verdict and a code. Five
 * consecutive live runs were refuted as `core.result.does_not_answer_request`,
 * correctly, and that string was the whole of what the repair was told -- so the
 * repair had to rediscover the defect from scratch, at the cost of a second full
 * exploration, and on the one run where it reached the model it produced no
 * correction at all.
 *
 * **The two halves are kept apart because their provenance differs.**
 * `findings` and `fix` are Core's: arithmetic over the summary it already holds,
 * and a sentence per finding that Core wrote. `judgement` is the model's own
 * reading, screened. A run record carries only the first two
 * (`run-outcome.ts`); the second reaches the repair through the failure record's
 * `expected` and `actual`, which is where a sentence written outside Core has
 * always travelled (`llm/harness/locator-text.ts`).
 *
 * **Nothing here is demanded of the model.** No new response field, no new
 * schema key, nothing a malformed answer can fail: `judgement` is read off the
 * `expected`, `observed` and `changed` the diagnosis channel already carries, and
 * a field that is missing, oversized, wrongly typed or refused by a screen is
 * simply absent from the directive. A judgement that says nothing beyond `no`
 * still produces a valid refutation with Core's own findings in it.
 */
export type AutomationStudioResultRepairDirective = {
  schemaVersion: "automation-studio.result-repair-directive.v1";
  /** What Core found wrong with the data, in the order found. */
  findings: AutomationStudioResultRepairFinding[];
  /** What to do about it, in reading order. Core's own words, one line per finding. */
  fix: string[];
  /**
   * What the check itself said, screened and bounded: what it took the request
   * to ask for, what it saw instead, and what it advised. Every part optional --
   * absent advice is still a valid refutation, and a run must never fail because
   * the judgement was terse.
   */
  judgement?: { expected?: string; observed?: string; advice?: string; /** Whether what was asked can still be had: a build ends "not doable" only on `no` (t195-w37). */ stillAchievable?: "yes" | "no" | "unknown" };
  /**
   * Core's check of the rows the judgement names against what the run holds,
   * one line each in Core's words (`request-rows/`): a row it calls left out
   * that is in the result, a row it calls wrongly kept that is not, the rows a
   * condition it blames really left out. What the repair weighs the advice by:
   * advice resting on a row the result contradicts is not followed.
   */
  checked?: string[];
  /** True when something the judgement said was dropped by a screen rather than carried. */
  withheld?: boolean;
};
