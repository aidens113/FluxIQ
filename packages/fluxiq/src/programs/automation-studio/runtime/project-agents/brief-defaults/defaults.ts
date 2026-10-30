import type { JsonObject, JsonValue } from "../../../../../core/index.ts";
import { automationStudioProjectBuilderReturn as RETURN, type AutomationStudioProjectBuilderReturn, type AutomationStudioProjectStructurePlan } from "../contracts/index.ts";

/**
 * Fills in what Core already knows of the briefs `project.dispatch` was sent,
 * for each field a brief left out; a field that was sent is never overridden,
 * and is checked as before (`../supervisor/brief-input.ts`, `../supervisor/dispatch-tool.ts`).
 *
 * - `kind`: `repair` when the subflow's latest build or repair brief under the
 *   plan in force came back not done after its builder ran, else `build`.
 * - `parts` (build or repair): the parts the plan in force gives the subflow.
 * - `failingReceipt` (repair): the subflow's trial closest to passing that its
 *   returns listed, else the latest whole test that did not pass
 *   (`wholeTest`); absent when neither exists, so the refusal of a repair with
 *   nothing to repair from stands.
 *
 * A brief that is not an object, or names no subflow of the plan, is left for
 * the reading to refuse. Returns the value whole, with the briefs replaced.
 */
export function automationStudioProjectSupervisorBriefDefaults(input: {
  value: JsonObject;
  structure: AutomationStudioProjectStructurePlan;
  state: { latestFor(subflowKey: string): { returned: AutomationStudioProjectBuilderReturn } | undefined; answeredFor(subflowKey: string): readonly { returned: AutomationStudioProjectBuilderReturn }[] };
  /** The latest whole test as a failing receipt names it, when one stands that did not pass. */
  wholeTest?: JsonObject;
}): JsonObject {
  const { value, structure, state } = input;
  if (!Array.isArray(value.briefs)) return value;
  const briefs = value.briefs.map((raw): JsonValue => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return raw;
    const written = raw as JsonObject;
    const key = written.subflowKey;
    if (typeof key !== "string" || !structure.plan.subflows.some((subflow) => subflow.key === key)) return raw;
    const filled: JsonObject = { ...written };
    if (filled.kind === undefined) {
      const last = state.latestFor(key);
      filled.kind = last && last.returned.outcome !== "done" && last.returned.calls > 0 ? "repair" : "build";
    }
    if (filled.kind !== "build" && filled.kind !== "repair") return filled;
    if (filled.parts === undefined) filled.parts = [...(structure.partOf[key] ?? [])];
    if (filled.kind === "repair" && filled.failingReceipt === undefined) {
      const receipt = receiptFor(state.answeredFor(key).map(({ returned }) => returned), input.wholeTest);
      if (receipt) filled.failingReceipt = receipt;
    }
    return filled;
  });
  return { ...value, briefs };
}

/** The closest trial of the returns that did not pass, else the whole test; a done return's last trial without a verdict is the yes it ended on. */
function receiptFor(returns: readonly AutomationStudioProjectBuilderReturn[], wholeTest: JsonObject | undefined): JsonObject | undefined {
  const listed = returns.map((returned) => (returned.outcome === "done" ? { ...returned, trials: returned.trials.filter((trial, at) => at !== returned.trials.length - 1 || trial.verdict !== undefined) } : returned));
  const closest = RETURN.closestTrial(listed);
  return closest ? { ...RETURN.trialRef(closest) } : wholeTest;
}
