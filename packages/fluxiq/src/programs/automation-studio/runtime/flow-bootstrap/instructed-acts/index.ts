// Barrel for the instructed-acts check: whether every lasting act the
// instruction asks for has a step in the draft that does it.
//
// `instruction-acts.ts` is published beside the check because the reading of
// an instruction's acts is also what a resumed build is told it still owes
// (`../incomplete-draft/`); it is the one reading, so nothing reads acts twice.
//
// `instruction-choices.ts` and `choice-evidence.ts` are deliberately absent:
// an act's choices travel on the act (`requires`), and whether a step's input
// makes one is how the check reaches its verdict, not what it offers.
export * from "./check.ts";
export * from "./contracts.ts";
export * from "./instruction-acts.ts";
