// Barrel for the answerability check: whether the Flow a build wrote could
// answer the instruction at all, and what a refusal tells the model.
//
// `library-record-sets.ts` and `plan-record-sets.ts` are deliberately absent.
// They are how the check reaches its verdict, not what it offers.
//
// `instruction-ask.ts` is published so every path asks this one reader whether
// an instruction wants rows back, and none grows a second: answer-first's
// completion check refuses an attempt whose request asks for rows when no read
// has run (lane B, run-mw45itmx-c4d6f5cb).
//
// `instruction-columns.ts` is published, because the columns an instruction
// names are read once and used twice: here, in the feedback, and by the build's
// authoring, which declares them as the schema of an extraction whose author
// declared none (`../authoring/instruction-record-columns.ts`). A second reader
// of the same words is how the two would come to disagree.
export * from "./check.ts";
export * from "./contracts.ts";
export * from "./instruction-ask.ts";
export * from "./instruction-columns.ts";
