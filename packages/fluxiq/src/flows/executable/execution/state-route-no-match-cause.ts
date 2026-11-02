/**
 * Why state routing found no way on for a step that could not run (t661), as
 * the routing decision tells its cases apart (`runtime/executor/state-routing/decision.ts`):
 *
 * - `effect_not_on_page`: the step recorded its own effect, the page did not
 *   show it, and no other step recorded an expected starting page.
 * - `effect_route_refused`: the page showed the step's own effect, going on
 *   past it was refused, and no other step recorded an expected starting page.
 * - `matches_refused`: the page matched other steps' expected starting pages,
 *   and a safety guard refused going on at each (`refused` names them).
 * - `matching_steps_already_acted`: the steps whose starting page matched had
 *   already acted in this run, and nothing showed their effect gone.
 * - `no_step_matches_page`: the page matched no step's expected starting page.
 */
export type AutomationStudioFlowRunStateRouteNoMatchCause = "effect_not_on_page" | "effect_route_refused" | "matches_refused" | "matching_steps_already_acted" | "no_step_matches_page";
