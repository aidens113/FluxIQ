// The order a repeat over a listing walks its rows in (t796).
//
// A `repeat over: <listing>` span becomes a For Each fed by the listing's rows
// (`../authoring/draft-routing.ts`), and `repeat most: N` is that For Each's stop after
// the first N (`nodes/control-flow/for-each.ts`). A listing whose node hands
// its rows on in the order the page shows them (`answersRows: "page_order"`)
// cannot reorder them itself: its own sort orders only the answer it saves. So
// "the three newest" on a page that lists featured or pinned rows first had no
// way to be said, and a live build copied a date cutoff out of the answer
// instead (`run-mvtdn37t-e1e4d0a7`, 0105, 0140, 0230).
//
// Core does the ordering here. Once the plan is assembled, each For Each whose
// rows come from such a listing is given the listing's own sort as its `order`
// (`./listing-repeat-sort.ts` reads it), so the loop orders
// the rows, then takes its first N, and the listing keeps the sort, so the
// answer it saves is in the same order as the rows the repeat walked. A script
// and a draft both reach this through `../authoring/assemble.ts`, so a written loop and a
// drafted one are ordered alike. A For Each that already holds an `order` keeps
// it, and a listing whose node declares no page order, or whose sort is only in
// `recordOutput.process`, is left as it was: the rule over lasting repeats
// still answers those (`./listing-order-in-repeat.ts`).
//
// The model never writes `order`: it writes the sort on the listing, which the
// script format already asks for (`../plan/flow-script-format.ts`).
import type { AutomationStudioNodeRegistry, AutomationStudioNodeRegistryResolution } from "../../../nodes/index.ts";
import type { AutomationStudioFlowBootstrapPlan, AutomationStudioFlowBootstrapSubflow } from "../plan/index.ts";
import { automationStudioListingRepeatSort } from "./listing-repeat-sort.ts";

/** The node a `repeat over` span becomes, the input its rows arrive on, and the option it orders them by. */
const FOR_EACH_ID = "builtin.control.for-each";
const ROWS_INPUT = "items";
const ORDER = "order";

/** The plan with each For Each over a page-order listing given that listing's sort; the same plan when none is (header). */
export function automationStudioFlowPlanRepeatOrder(input: {
  plan: AutomationStudioFlowBootstrapPlan;
  registry: AutomationStudioNodeRegistry;
  resolution: AutomationStudioNodeRegistryResolution;
}): AutomationStudioFlowBootstrapPlan {
  let changed = false;
  const subflows = input.plan.subflows.map((subflow) => {
    const ordered = orderedSubflow(subflow, input.registry, input.resolution);
    if (ordered !== subflow) changed = true;
    return ordered;
  });
  return changed ? { ...input.plan, subflows } : input.plan;
}

function orderedSubflow(subflow: AutomationStudioFlowBootstrapSubflow, registry: AutomationStudioNodeRegistry, resolution: AutomationStudioNodeRegistryResolution): AutomationStudioFlowBootstrapSubflow {
  const byKey = new Map(subflow.nodes.map((node) => [node.key, node]));
  let changed = false;
  const nodes = subflow.nodes.map((node) => {
    if (node.definitionId !== FOR_EACH_ID || node.parameters?.[ORDER] !== undefined) return node;
    // A For Each takes its rows on one connection, from one listing.
    const feed = subflow.edges.find((edge) => edge.target.nodeKey === node.key && edge.target.portId === ROWS_INPUT);
    const listing = feed ? byKey.get(feed.source.nodeKey) : undefined;
    const definition = listing ? registry.get(listing.definitionId, resolution) : undefined;
    const sort = definition ? automationStudioListingRepeatSort(definition, listing?.parameters) : undefined;
    if (!sort) return node;
    changed = true;
    return { ...node, parameters: { ...node.parameters, [ORDER]: sort.keys } };
  });
  return changed ? { ...subflow, nodes } : subflow;
}
