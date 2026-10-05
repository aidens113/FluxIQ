// Barrel for a build that stopped before its Flow was ready: how a live round
// ended, the test and the judgement of the Flow so far (phase 2), the repair
// rounds that follow it (phase 3), and the endings a build that still cannot
// finish reaches -- not doable, with its reason, not finished with the Flow
// kept, a budget that ran out, or model replies that could not be read, each
// said as exactly that (user, 2026-09-30; audit A3, cause 1; t211; t195-w37).
export * from "./budget-exhausted.ts";
export * from "./contracts.ts";
export * from "./ending-fit.ts";
export * from "./finishing-verdict.ts";
export * from "./judgement.ts";
export * from "./kept-said.ts";
export * from "./not-doable.ts";
export * from "./not-run.ts";
export * from "./not-done.ts";
export * from "./not-finished.ts";
export * from "./phases.ts";
export * from "./progress.ts";
export * from "./provider-unavailable.ts";
export * from "./replies-unreadable.ts";
export * from "./reserve-judging.ts";
export * from "./round-ending.ts";
export * from "./seed-signature.ts";
export * from "./tried.ts";
export * from "./unchanged-complete.ts";
export * from "./unfinished-stall.ts";
