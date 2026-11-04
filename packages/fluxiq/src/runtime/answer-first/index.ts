// The answer-first runtime. Only the act record and the guidance are here at the top: every run's
// options load this, and the rest (`./result/`, `./keep-going/`, `./attempt-purse/`) load the
// loop's modules, whose value import through this barrel once closed a cycle that left the
// harness's barrel half filled. Those are imported by their own barrels.
export * from "./act-record/index.ts";
export * from "./guidance/index.ts";
