/**
 * The route the draft shows (D phase 2), from the build's one grounded read of
 * the person's instructions (`../../action-permissions/instruction-route/`),
 * once that read has settled and still matches the instructions: the route
 * they named, in their words, with the words of each place on it in order
 * (`places[0]` is `r1`); or that they named none, so the Flow may start where
 * the work begins. Nothing while the route is unread or could not be read.
 */
export type AutomationStudioFlowDraftRoute =
  | { state: "named"; quote: string; places: readonly string[] }
  | { state: "open" };
