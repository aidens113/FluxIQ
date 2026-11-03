import type { AutomationStudioProjectReceiptRef } from "../index.ts";
import type { AutomationStudioCandidateTrialVerdict } from "../../plan/index.ts";

// What a builder hands back: compact by construction, because the supervisor
// reads this and never the builder's history. A return is bound to its brief
// -- and through the brief to one structure-plan digest -- so a proposal for
// another subflow, or a survey's findings on a build, is refused.

/**
 * A trial a return lists (t606): its receipt reference, and beside it what the
 * trial answered and how many rows it stored, so the supervisor can tell the
 * trial closest to passing from the latest (`closestTrial` below).
 * A8 towels (`run-mv8p37k8-f1a90624`) had three trials store exactly the
 * right rows and answer unsure, and the repair was sent the latest, a no that
 * stored two. `verdict` and `rows` are additive: the reference a repair's
 * `failingReceipt` copies is still `kind`, `receiptId` and `digest`, and the
 * digest is made as before, from the trial's verdict among the rest
 * (`../dispatch/receipts.ts`), so these fields never change it. A return
 * written before them lists neither.
 *
 * **`rows` is the answer set's, and among one verdict the latest wins (t752).**
 * Trials of one verdict were ranked by the rows they stored, summed over every
 * record set. A trial that stored a few wrong answer rows beside a large
 * unconditioned working read outnumbered a later trial whose answer was exactly
 * right plus the same working read, and the repair was seeded from the earlier
 * one. For a filtered request more rows is not closer to passing. `rows` now
 * counts the answer set alone (`../dispatch/receipts.ts`), and among trials of
 * one verdict `closestTrial` takes the latest, unless the latest stored no
 * answer rows and an earlier one did.
 */
export type AutomationStudioProjectTrialRef = AutomationStudioProjectReceiptRef & {
  verdict?: AutomationStudioCandidateTrialVerdict;
  /** The rows the trial stored, where its feedback said. */
  rows?: number;
};
