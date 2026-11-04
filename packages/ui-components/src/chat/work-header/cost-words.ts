// The cost segment of the work header: "$0.34 of $5.00", and a calm sentence
// once the spend is close to the limit. The numbers come from the host's
// meter (a `working` attempt's `spend.usd` and `budget.usd`); without both, the
// header says nothing of cost rather than guess. No DOM.

/** The share of the budget at which the header says so in words. */
export const NEAR_LIMIT = 0.8;

/** What the header says of cost: `text` is "" without a usable meter; `limit` is "" until the spend is near the budget. */
export type CostWords = { text: string; limit: string };

const dollars = (usd: number): string => `$${usd.toFixed(2)}`;

/** The cost words for a meter's `usd` spent of `budgetUsd`. */
export function costWords(usd: number | undefined, budgetUsd: number | undefined): CostWords {
  if (usd === undefined || budgetUsd === undefined || !Number.isFinite(usd) || !Number.isFinite(budgetUsd) || usd < 0 || budgetUsd <= 0) return { text: "", limit: "" };
  const share = usd / budgetUsd;
  return { text: `${dollars(usd)} of ${dollars(budgetUsd)}`, limit: share >= 1 ? "At the limit" : share >= NEAR_LIMIT ? "Close to the limit" : "" };
}
