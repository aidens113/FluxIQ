import type { ResultComputedFact } from "./fact.ts";
import type { ResultComputedFactsInput } from "./input.ts";

/** One fact's computation: the facts it could compute (none where it could compute none). */

export type ResultComputedFactCheck = (input: ResultComputedFactsInput) => ResultComputedFact[];
