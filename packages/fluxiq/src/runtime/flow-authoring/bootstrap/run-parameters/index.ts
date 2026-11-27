// The parameters Core writes onto a step for how it runs (`./step-run-parameters.ts`, t1075): one list the assembly
// writes from and every reader of a step's identity leaves out (`./is-run-parameter.ts`, `./without-run-parameters.ts`).
// Kept in a barrel of its own so the act record, which every run loads, imports nothing else of the build.
export * from "./is-run-parameter.ts";
export * from "./step-run-parameters.ts";
export * from "./without-run-parameters.ts";
