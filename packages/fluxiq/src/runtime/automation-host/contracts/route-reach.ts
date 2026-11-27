// A step passed over still owes where it went (t1083).
//
// State routing passes over a step whose state never arose this run
// (`engine/automation/state-routing/not-arisen.ts`): the drawer an Add opens
// never came because the Add was already done, so the drawer's "View cart" has
// no control to press. But that step's own recorded effect may be the move to
// another page -- the cart -- which every step after it was written on. Passing
// it over must not drop where it went (bigbox `run-mwz29d50-c3a32a9c`: the cart
// read ran four times on the product page).
//
// Core cannot tell where a step went: its recorded effect is the host's, opaque
// (`../route-state/effect.ts`), and Core reads no link, address or page words.
// So the host is asked, with the effect, to bring the page to the route that
// effect went to, and answers how in one closed word. Core decides only that a
// passed-over step whose effect moved the page still owes that route, and that
// the run is on it before the next step.

import type { JsonObject } from "../../../core/index.ts";
import type { AutomationStudioFlowNode } from "../../../flows/executable/graph/index.ts";

/** What the host is asked: the step passed over, its recorded effect, and the project and Flow it runs for. */
export type AutomationStudioRouteReachRequest = {
  node: AutomationStudioFlowNode;
  /** The step's recorded effect, as the host's `signRouteEffect` signed it. */
  effect: JsonObject;
  projectId: string;
  flowId: string;
  signal?: AbortSignal;
};

/**
 * How the page came to the route a step's recorded effect went to.
 *
 * - `stays`: the effect moved to no other route, so nothing is owed (a drawer's
 *   Close, a cover's dismiss).
 * - `already_there`: the page is on that route.
 * - `pressed`: the host pressed a control on the page that goes there, and the
 *   page arrived.
 * - `went`: the host went to the destination the effect recorded, and the page
 *   arrived.
 * - `unreached`: the effect moved the page, and the host could not bring it
 *   there.
 *
 * Reaching a route is a move, never a lasting act.
 */
export type AutomationStudioRouteReachAnswer = "stays" | "already_there" | "pressed" | "went" | "unreached";

/** The three answers that leave the page on the owed route: what a passed-over step's attempt records (`skipped.reached`). */
export type AutomationStudioRouteReached = Extract<AutomationStudioRouteReachAnswer, "already_there" | "pressed" | "went">;
