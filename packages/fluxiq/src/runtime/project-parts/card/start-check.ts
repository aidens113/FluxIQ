// Where a part may start, and what proves it can: read-only and zero-wait facts,
// in the host's own form (`runtime/automation-host/contracts/fact-condition.ts`),
// which a guard evaluates before the part runs.
//
// In order: the part's declared entries (`fluxiq.entry`); else an `exists` fact
// over the first acting step's own target; else, for a part whose first step
// navigates to a literal address on its own site, no check and `selfArrives`
// (the part brings its own page); else none, which the runner refuses.
import type { AutomationStudioSubflowCardCheck } from "@fluxiq/contracts/automation";
import type { JsonObject } from "../../../core/index.ts";
import { isAutomationNodeParameterStateBinding } from "../../../components/automation/index.ts";
import type { AutomationStudioSubflowContract } from "../../../engine/automation/lifecycle/index.ts";
import { partCheckOf } from "./condition-digest.ts";
import { partOriginOf, partStepNavigates } from "./origins.ts";
import type { AutomationStudioPartStep } from "./steps.ts";
import type { AutomationStudioPartStartRecord } from "./types.ts";

export function partStartCheckOf(input: {
  contract: Pick<AutomationStudioSubflowContract, "entries">;
  steps: readonly AutomationStudioPartStep[];
  sites: readonly string[];
  controlKeys: ReadonlySet<string>;
}): { start: AutomationStudioPartStartRecord; check?: AutomationStudioSubflowCardCheck } {
  const entry = [...input.contract.entries].filter((candidate) => candidate.when.length > 0).sort((left, right) => left.order - right.order)[0];
  if (entry) {
    const check = partCheckOf(entry.when, "A starting state the part declares holds.");
    return { start: { source: "entry", conditions: structuredClone(entry.when) }, ...(check ? { check } : {}) };
  }
  const first = input.steps.find((step) => step.acting);
  const target = first ? controlTargetOf(first, input.controlKeys) : undefined;
  if (target) {
    const conditions = [{ fact: "exists", op: "exists" as const, target: structuredClone(target) }];
    const check = partCheckOf(conditions, "The control the first step uses is on the page.");
    return { start: { source: "first_step", conditions }, ...(check ? { check } : {}) };
  }
  if (first && partStepNavigates(first)) {
    const origin = partOriginOf(first.params.url);
    if (origin && input.sites.includes(origin)) return { start: { source: "navigate", conditions: [], selfArrives: true } };
  }
  return { start: { source: "none", conditions: [] } };
}

/** The first parameter the domain says names the control that holds an object; a handle string or a binding is no durable target. */
function controlTargetOf(step: AutomationStudioPartStep, controlKeys: ReadonlySet<string>): JsonObject | undefined {
  for (const key of controlKeys) {
    const target = step.params[key];
    if (target && typeof target === "object" && !Array.isArray(target) && !isAutomationNodeParameterStateBinding(target) && Object.keys(target).length > 0) return target;
  }
  return undefined;
}
