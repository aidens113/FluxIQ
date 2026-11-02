import type { JsonValue } from "@fluxiq/contracts/core";

/**
 * The view of its target -- for the web domain, the page -- a run or a test
 * ended on, as the domain produced it (t174-w87). Run `run-murwd8le-79e735a8`'s
 * judges never saw `Cart (3)`, the coupon's "Collected" or the quantity field,
 * and one of them invented a quantity that was never committed.
 */

export type ResultEndView = {
  /** What it was taken after: a test's step number, or the node a run ran last. */
  after?: number | string;
  /** The domain's view, by its own keys and screened, otherwise as it came. */
  view: JsonValue;
};
