// Barrel for task attempts, the shared records of the Answer First loop: one try at
// a task, what it found, whether the two agree, its merged act record, what it tried,
// what it left saved, and a saved subflow's card, each with a strict parser. No record
// here may carry a page address, page text or a token, past the two named exceptions
// on a result (`./task-result.ts`). `field-checks.ts`, `parse-totally.ts` and
// `person-words.ts` are internal and not re-exported.
export * from "./attempt-act.ts";
export * from "./attempt-result-check.ts";
export * from "./limits.ts";
export * from "./model-key-lock.ts";
export * from "./loops-caught.ts";
export * from "./saved-state.ts";
export * from "./subflow-card.ts";
export * from "./task-attempt.ts";
export * from "./task-result.ts";
export * from "./tried-record.ts";
export * from "./trust.ts";
