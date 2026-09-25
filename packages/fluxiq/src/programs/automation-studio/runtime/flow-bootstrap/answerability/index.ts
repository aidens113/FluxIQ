// Barrel for the answerability check: whether the Flow a build wrote could
// answer the instruction at all, and what a refusal tells the model.
//
// `instruction-ask.ts`, `library-record-sets.ts` and `plan-record-sets.ts` are
// deliberately absent. They are how the check reaches its verdict, not what it
// offers, and publishing them would invite a second place that decides what an
// instruction asks for.
export * from "./check.ts";
export * from "./contracts.ts";
