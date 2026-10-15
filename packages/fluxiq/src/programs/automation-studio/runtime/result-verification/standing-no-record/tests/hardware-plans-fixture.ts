// The plans the revisions of the hardware run
// (`../../refuted-no/tests/hardware-fixture.ts`, t651) wrote: the read step
// with its three conditions, with its seller condition over a seller line of
// its own, and each without one of them. No task, site, item or answer of any
// realistic scenario.
import { HOUSE } from "../../refuted-no/tests/hardware-fixture.ts";
import type { AutomationStudioResultConditionPlan } from "../../standing-no/index.ts";

/** The conditions as the revision that ran wrote them. */
const DELIVERY_WRITTEN = { field: "delivery", contains: "Delivery tomorrow" };
const RATING_WRITTEN = { field: "rating", atLeast: 4 };
const SELLER_WRITTEN = { field: "seller", startsWith: HOUSE };

/** A plan of the search step and the read step (`find_drills.s6`), the read written with `where`. */
export function hardwarePlan(where: readonly object[] = [DELIVERY_WRITTEN, RATING_WRITTEN, SELLER_WRITTEN]): AutomationStudioResultConditionPlan {
  return { subflows: [{ key: "find_drills", nodes: [
    { key: "s2", parameters: { text: "cordless drill" } },
    { key: "s6", parameters: { extractList: { where, fields: { name: "title", price: "price", rating: "stars", delivery: "ship", seller: "title_inner" } } } }
  ] }] };
}

/** The plan whose seller condition reads a seller line of its own (`sellerLine`). */
export function hardwareLinePlan(): AutomationStudioResultConditionPlan {
  return hardwarePlan([DELIVERY_WRITTEN, RATING_WRITTEN, { field: "seller", contains: HOUSE }]);
}

/** The plan without its seller condition: what the run's revision 4 submitted. */
export function hardwarePlanWithoutSeller(): AutomationStudioResultConditionPlan {
  return hardwarePlan([DELIVERY_WRITTEN, RATING_WRITTEN]);
}

/** The plan without its delivery condition. */
export function hardwarePlanWithoutDelivery(): AutomationStudioResultConditionPlan {
  return hardwarePlan([RATING_WRITTEN, SELLER_WRITTEN]);
}
