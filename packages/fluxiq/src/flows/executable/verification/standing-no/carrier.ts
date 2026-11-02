import type { ResultStandingNoRecord } from "./record.ts";

/**
 * What carries Core's record of a judged build test, outside what a model is
 * shown: a verification (`AutomationStudioResultVerification`, set by
 * `../agreement/` on every outcome a build test's two calls reach -- a double
 * no, and since t652 a split or an unsure too -- never on a runtime check,
 * never recorded on a run), and a trial's result, beside its feedback. Only a
 * no is ever weighed by its `standing` calls (`./memory.ts`); any judged
 * trial's conditions may be kept (`./kept-conditions.ts`).
 */

export type ResultStandingNoCarrier = { standingNo?: ResultStandingNoRecord | undefined };
