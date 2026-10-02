// Barrel for the answerability check: whether the Flow a build wrote could
// answer the instruction at all, and what a refusal tells the model.
//
// `instruction-ask.ts`, `library-record-sets.ts` and `plan-record-sets.ts` are
// deliberately absent. They are how the check reaches its verdict, not what it
// offers, and publishing them would invite a second place that decides what an
// instruction asks for.
//
// `instruction-columns.ts` is published, because the columns an instruction
// names are read once and used twice: here, in the feedback, and by the build's
// authoring, which declares them as the schema of an extraction whose author
// declared none (`../authoring/instruction-record-columns.ts`). A second reader
// of the same words is how the two would come to disagree.
export * from "./check.ts";
export * from "./contracts.ts";
export * from "./instruction-columns.ts";
