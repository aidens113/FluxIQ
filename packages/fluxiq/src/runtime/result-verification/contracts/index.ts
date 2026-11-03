// What a run's result is judged to be, and the bounded account of the result
// that the judgement is made from.
//
// FluxIQ had no check at all that a finished run answered what was asked. A run
// failed only when a step failed, so four separate live runs on 2026-09-17 each
// reported success while returning the wrong thing: a catalogue that returned
// none of its eight records, a catalogue whose every row was refused by record
// validation, a feed that returned ten of forty entries, and a request for two
// matching records that returned all two hundred and forty because the built
// Flow had no filtering step in it. Nothing failed, so nothing was reported.
// The test facility caught all four only because it holds a written answer key,
// and a person running their own automation has no answer key.
//
// The vocabulary here is deliberately about a *result*, not about a step. A
// record and a column are domain-neutral -- a row of values with named fields
// is what any medium's extraction produces -- and nothing in this directory knows
// where the values came from.

export type { AutomationStudioResultConditionObservation, AutomationStudioResultLeftOutObservation, AutomationStudioResultReadCondition } from "../read-condition.ts";
// The bounds live in `runtime/loop-limits/`, which neither this directory nor
// the harness owns. This file used to re-export them so a reader of the contract
// had them in hand, and no longer does: `result-summary.ts`, the module that
// applies every one of them, re-exports them instead, and the directory barrel
// publishes them from there, so nothing outside changes.
//
// It was moved because the re-export made a *contract* file reach a value out of
// another directory, and that directory's barrel also carries the evidence-loop
// budgets, which import values out of `runtime/llm/harness/`. So reading a byte
// bound pulled the whole LLM harness into the evaluation of every module that
// reads this contract -- and on 2026-09-26, with `runtime/llm` mid-rewrite, that
// made five of this directory's seven test suites fail to load at all on a
// `runtime/llm` module cycle none of them touch. A contract should cost its
// readers nothing to read.

// One record set as the verification reads it, and its sort as Core read it (`./record-set-summary.ts`).
export type { AutomationStudioResultRecordSetSummary, AutomationStudioResultSortRead } from "../record-set-summary.ts";

export * from "./verdict.ts";
export * from "./flow-step-summary.ts";
export * from "./read-account.ts";
export * from "./run-result-summary.ts";
export * from "./build-test.ts";
export * from "./earlier-advice.ts";
export * from "./task-checklist.ts";
export * from "./requested-output.ts";
export * from "./repair.ts";
export * from "./verification.ts";
export * from "./verification-reading.ts";
export * from "./computed-facts.ts";
