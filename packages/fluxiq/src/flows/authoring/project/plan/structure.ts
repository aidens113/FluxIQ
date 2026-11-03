import type { AutomationStudioFlowBootstrapPlan } from "../../plan/index.ts";

// The structure plan: the Flow's shape before any step exists. It is the
// existing bootstrap plan with every subflow body empty -- each subflow names
// what it is, its interface and, when it has one, the success check that
// proves it worked -- plus `partOf`, which task-spec parts each subflow
// carries. Builders fill the bodies; assembly composes them back into one
// whole plan.
//
// A subflow may come with no success check (no `metadata`): the plan the
// supervisor writes leaves proposing one to the subflow's builder
// (`../supervisor/plan-input.ts`, t569). A `metadata` given still holds a
// non-empty check, as before.
//
// Validation here is what can be checked without a node registry: the shape,
// the digest, the binding to one task-spec revision, that every part is carried
// by at least one subflow, and the router's own checks (conditions, shadowed
// routes, reachability). A part subflow -- one with an interface -- and a
// recovery subflow are reached through steps no builder has written yet, so
// their reachability is left to the assembled candidate's validation.
//
// **A part is carried once (A8 wave 10 crossborder, t638).** The amended plan
// of `run-mv9q50ui-1736d010` gave one part to three subflows that run one
// after another, so each builder set out to do it again. A part in the
// `partOf` of more than one subflow is refused `project.plan_part_carried_twice`,
// by each carrier's entry after the first. Two exceptions run at most one
// carrier in any run: the subflows the router chooses between by situation
// (its rules' targets and, beside them, its fallback), which count as one
// carrier, and a recovery subflow, which redoes a part only where the run
// failed and counts as none.

export type AutomationStudioProjectStructurePlan = {
  taskSpecDigest: string;
  plan: AutomationStudioFlowBootstrapPlan;
  /** Subflow key to the task-spec part ids it carries; every subflow is listed. */
  partOf: Record<string, string[]>;
  digest: string;
};
