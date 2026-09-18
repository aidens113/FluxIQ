// Where this is called from, and where it is deliberately not.
//
// A run that was not retried has its result verified before it is returned,
// because nothing else in Core asks whether the result answers the request. A
// RETRIED session is not verified at that call site: it came back through the
// change verdict, which has already judged it, and verifying it twice would
// charge a second provider call to say the same thing.
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
