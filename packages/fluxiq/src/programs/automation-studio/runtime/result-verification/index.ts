// Where this is called from, and what it now covers that it did not.
//
// Every run that reports success has its result verified before it is returned,
// because nothing else in Core asks whether the result answers the request.
//
// **Including a retried one.** A retried session used to be returned unverified,
// on the reasoning that it "came back through the change verdict, which has
// already judged it". That reasoning does not hold and it left a hole: the
// change verdict judges whether the patch applied and whether the retried steps
// succeeded, not whether the result answers the request. A repair that produced
// a second wrong answer was therefore reported as a success, which is precisely
// the failure this module exists to catch. It costs a verification call on a
// repaired run, and the circle it could close -- verify, repair, retry, verify
// -- is bounded by the failure entry point being taken once per run
// (`recovery/refuted-result/repair.ts`).
//
// The retry itself carries its own session and a declined code, so a run that
// may not resume says why rather than stopping silently.

export * from "./contracts.ts";
export * from "./core-observation.ts";
export * from "./result-summary.ts";
export * from "./run-outcome.ts";
export * from "./verdict.ts";
export * from "./verification-status.ts";
export * from "./verify.ts";
