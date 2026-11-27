// A step passed over as "state never arose" still owes where it went (t1083).
//
// **The failure.** Bigbox `run-mwz29d50-c3a32a9c`, attempt 2: the replay rightly
// left "Add to cart" alone as already done, so the "Added to cart" panel that only
// an add opens never came, and the panel's "View cart" was passed over
// (`./not-arisen.ts`). That step's own recorded effect was the move to the cart --
// its route signatures' paths differ before and after -- and passing it over
// dropped the move. The cart read after it ran four times on the product page and
// found nothing.
//
// **The rule.** A step passed over this way whose recorded effect moved the page to
// another route still owes that route: the run must be on it before the next step.
// Core cannot tell where a step went, because the effect is the host's and opaque,
// so the host is asked to bring the page there (`reachRouteEffect`,
// `runtime/automation-host/contracts/route-reach.ts`). The host goes on where the
// page already is, presses a control on the page that goes to the same route, or
// goes to the recorded destination, and answers how. Reaching a route is no lasting
// act, so the guards that keep an act from being made twice stand.
//
// **What it changes nothing for.** A step with no recorded effect, a host that
// cannot reach routes, and an effect that moved to no other route (a drawer's
// Close, a cover's dismiss) are passed over exactly as before (`stays`). A host
// that could not bring the page there (`unreached`), or threw, or answered anything
// else, leaves the step to state routing's other cases and the recovery ladder: a
// run is never sent on to steps written on a page it is not on.

import type { AutomationStudioFlowNode } from "../../../flows/executable/graph/index.ts";
import type { AutomationStudioRouteReachAnswer } from "../../../runtime/automation-host/contracts/index.ts";
import type { AutomationStudioHostRuntimeBoundary } from "../../../runtime/automation-host/index.ts";
import { automationStudioNodeRouteSignatures } from "../../../runtime/automation-host/route-state/index.ts";
import type { AutomationStudioStateRouteDecision } from "./decision.ts";

const ANSWERS: ReadonlySet<string> = new Set<AutomationStudioRouteReachAnswer>(["stays", "already_there", "pressed", "went", "unreached"]);

/** Where the run stands with the route a passed-over step's recorded effect went to (header). */
export async function automationStudioNotArisenRouteOwed(input: {
  node: AutomationStudioFlowNode;
  hostRuntime: AutomationStudioHostRuntimeBoundary | undefined;
  projectId: string;
  flowId: string;
  signal?: AbortSignal | undefined;
}): Promise<AutomationStudioRouteReachAnswer> {
  const effect = automationStudioNodeRouteSignatures(input.node).effect;
  const host = input.hostRuntime;
  const reach = host?.reachRouteEffect;
  if (!effect || !reach) return "stays";
  try {
    const answer: unknown = await reach.call(host, { node: input.node, effect, projectId: input.projectId, flowId: input.flowId, ...(input.signal ? { signal: input.signal } : {}) });
    return typeof answer === "string" && ANSWERS.has(answer) ? answer as AutomationStudioRouteReachAnswer : "unreached";
  } catch {
    // A host that could not say where the page went cannot be trusted to have got it there.
    return "unreached";
  }
}

/**
 * A decision that found no way on, saying first that the failing step was not
 * passed over because the page could not be brought to the route its recorded
 * effect went to (header). Any other decision stands as it is.
 */
export function automationStudioUnreachedRouteSaid(decided: AutomationStudioStateRouteDecision, nodeId: string): AutomationStudioStateRouteDecision {
  if (decided.kind !== "none") return decided;
  const said = `Node ${nodeId}'s control never arose, and the page could not be brought to where its recorded effect went, so it was not passed over.`;
  return { kind: "none", record: { ...decided.record, reason: decided.record.reason ? `${said} ${decided.record.reason}` : said } };
}
