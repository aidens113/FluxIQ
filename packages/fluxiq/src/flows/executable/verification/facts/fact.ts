import type { ResultComputedDefect } from "./defect.ts";
import type { ResultComputedFactKind } from "./kind.ts";

/**
 * One computed fact. `said` is Core's sentence for it, in generic words that
 * name no site or scenario, bounded, read by the judge (a fact that holds) and
 * by the builder and the person (a fact that fails). `defects` is present, and
 * not empty, exactly when `status` is `fails`.
 */

export type ResultComputedFact = {
  kind: ResultComputedFactKind;
  status: "holds" | "fails";
  said: string;
  defects?: ResultComputedDefect[];
};
