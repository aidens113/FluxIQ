// Barrel for the reachability check: whether the Flow a build wrote could reach
// the place it was told to start, and what a refusal tells the model.
//
// `library-locations.ts` and `plan-locations.ts` are deliberately absent. They
// are how the check reaches its verdict, not what it offers, and publishing
// them would invite a second place that decides what reaching a start location
// means.
export * from "./check.ts";
export * from "./contracts.ts";
