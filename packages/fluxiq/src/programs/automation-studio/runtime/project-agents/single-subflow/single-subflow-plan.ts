import type { AutomationStudioProjectStructurePlan } from "../contracts/index.ts";

/**
 * The subflow key of a single-subflow plan, or undefined for any other plan
 * (t679): exactly one subflow, with no interface (no inputs or outputs), the
 * one the router runs, carrying at least one part. It is the plan the
 * supervisor's planning format compiles from one written subflow with no ports
 * (`../supervisor/plan-input.ts`), with no `main` added by Core. On such a plan
 * the assembled Flow is that subflow behind the arrival step, so the builder's
 * own test can be the build's judged whole run (`./single-subflow-trial.ts`).
 */
export function automationStudioProjectSingleSubflowPlan(structure: AutomationStudioProjectStructurePlan | undefined): string | undefined {
  if (!structure) return undefined;
  const { plan, partOf } = structure;
  if (plan.subflows.length !== 1) return undefined;
  const only = plan.subflows[0]!;
  if (only.interface !== undefined) return undefined;
  const fallback = plan.router.fallback;
  if (fallback.kind !== "subflow" || fallback.targetSubflowKey !== only.key) return undefined;
  return (partOf[only.key] ?? []).length > 0 ? only.key : undefined;
}
