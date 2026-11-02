import type { ResultKeptCondition } from "./condition.ts";

/** What carries a gate's kept conditions to the submission it is asked about, outside what a model is shown: the result a gate keeps for a trial (t641). */

export type ResultKeptConditionsCarrier = { keptConditions?: ResultKeptCondition[] | undefined };
