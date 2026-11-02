import type { ResultLeftOutObservation } from "./left-out-observation.ts";

/** Passive condition witness, retaining original text and no executable address or inferred eligibility. */

export type ResultConditionObservation = { conditionIndex: number } & ResultLeftOutObservation;
