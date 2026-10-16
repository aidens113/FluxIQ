import type { AutomationStudioFlowBootstrapInterface } from "../../flow-bootstrap/plan/index.ts";
import type { AutomationStudioProjectStructurePlan, AutomationStudioProjectTaskSpec } from "../contracts/index.ts";
import { automationStudioProjectSupervisorPartChange } from "./part-change.ts";

/**
 * The subflow of the plan in force a done subflow was merged into
 * (`./carried-proposals.ts`, t671): its key; the parts it holds that the
 * proposal was not built for; each other subflow of the earlier plan whose
 * parts moved into it; each output the proposal hands on that it no longer
 * has; whether it became the subflow the router runs; and each part it was
 * built for whose facts or lasting acts changed, with what.
 */
export type AutomationStudioProjectSupervisorMergedInto = { into: string; addedParts: string[]; mergedWith: string[]; removedOutputs: string[]; routerRun: boolean; changedParts: Array<{ part: string; what: string }> };

/**
 * Where subflow `key` of the plan `then` went when the plan in force merged
 * it (header of `./carried-proposals.ts`, t671). It fits a subflow `S` of `now`
 * when all of these hold, and only then:
 *
 * - `S` holds every part `key` was built for, each keeping its id and words:
 *   the same, reworded, or with its facts or lasting acts changed, which its
 *   trial judges again (`./subflow-change.ts`, t671);
 * - `S` is keyed `key` and holds a part `then` gave another subflow (another
 *   was merged into it), or `key` is gone from the plan (renamed, or merged
 *   into a new subflow). A part added that no subflow held before, under the
 *   same key, is no merge: that is the additive rule's, with its own
 *   conditions (t658);
 * - its role is the same, or a callable subflow became the one the router
 *   runs, as the only subflow left does (`../supervisor/plan-input.ts`);
 * - its inputs are the same, or `key` took none: a done proposal reads every
 *   input it declares (t581), so one taken away is one its steps read;
 * - every output `key` handed on that `S` does not is one no subflow of the
 *   plan in force takes, so nothing waits on what it no longer hands on.
 *
 * `taken` are the subflows already holding a done proposal under the plan in
 * force, which nothing is carried onto. A part is carried by one subflow only,
 * so at most one subflow holds all of them.
 */
export function automationStudioProjectSupervisorMergedInto(input: {
  key: string;
  now: AutomationStudioProjectStructurePlan;
  then: AutomationStudioProjectStructurePlan;
  specNow: AutomationStudioProjectTaskSpec;
  specThen: AutomationStudioProjectTaskSpec;
  taken: ReadonlySet<string>;
}): AutomationStudioProjectSupervisorMergedInto | undefined {
  const { key, now, then, specNow, specThen } = input;
  const built = then.partOf[key] ?? [];
  const was = then.plan.subflows.find((subflow) => subflow.key === key);
  if (!built.length || !was) return undefined;
  const gone = !now.plan.subflows.some((subflow) => subflow.key === key);
  const holder = now.plan.subflows.find((subflow) => built.every((part) => (now.partOf[subflow.key] ?? []).includes(part)));
  if (!holder || input.taken.has(holder.key) || (holder.key !== key && !gone)) return undefined;
  const changes = built.map((part) => ({ part, found: automationStudioProjectSupervisorPartChange(specNow, specThen, part) }));
  if (changes.some(({ found }) => found.change === "changed")) return undefined;
  const changedParts = changes.flatMap(({ part, found }) => (found.what ? [{ part, what: found.what }] : []));
  const addedParts = (now.partOf[holder.key] ?? []).filter((part) => !built.includes(part));
  const mergedWith = [...new Set(addedParts.flatMap((part) => Object.keys(then.partOf).filter((owner) => owner !== key && (then.partOf[owner] ?? []).includes(part))))];
  if (!gone && !mergedWith.length) return undefined;
  const routerRun = was.interface !== undefined && holder.interface === undefined && holder.role === "primary";
  if (holder.role !== was.role && !routerRun) return undefined;
  if ((was.interface?.inputs.length ?? 0) && !same(ids(was.interface?.inputs), ids(holder.interface?.inputs))) return undefined;
  const removedOutputs = ids(was.interface?.outputs).filter((output) => !ids(holder.interface?.outputs).includes(output));
  if (now.plan.subflows.some((subflow) => ids(subflow.interface?.inputs).some((wanted) => removedOutputs.includes(wanted)))) return undefined;
  return { into: holder.key, addedParts, mergedWith, removedOutputs, routerRun, changedParts };
}

/** The ids of one side of an interface, sorted; none when there is no interface. */
function ids(ports: AutomationStudioFlowBootstrapInterface["inputs"] | undefined): string[] {
  return (ports ?? []).map((port) => port.id).sort();
}

/** Whether two plain values hold the same JSON. */
function same(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}
