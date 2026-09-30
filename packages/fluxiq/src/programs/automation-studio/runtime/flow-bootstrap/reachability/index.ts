// Barrel for the reachability check: whether the Flow a build wrote could reach
// the place it was told to start, and what a refusal tells the model.
//
// `start-step.ts` is what completion builds the Flow from: the draft with the
// step that arrived kept in it, so a withdrawn arrival is not a refusal.
//
// `step-goes-to-location.ts` is which draft step that arrival is, published
// because the instructed-acts check must read it the same way: a step that only
// arrives where the Flow starts does no act but opening it.
//
// `library-locations.ts`, `plan-locations.ts` and `location-agreement.ts` are
// deliberately absent. They are how the check reaches its verdict, not what it
// offers, and publishing them would invite a second place that decides what
// reaching a start location means.
export * from "./check.ts";
export * from "./contracts.ts";
export * from "./start-step.ts";
export * from "./step-goes-to-location.ts";
