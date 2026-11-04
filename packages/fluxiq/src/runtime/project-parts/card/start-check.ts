// Where a part may start, and what proves it can: read-only and zero-wait facts,
// in the host's own form (`runtime/automation-host/contracts/fact-condition.ts`),
// which a guard evaluates before the part runs.
//
// In order: the part's declared entries (`fluxiq.entry`); else a `visible` fact over
// the first acting step's own target (not `exists`: a target that matches several
// things answers `exists`, which is how a press landed on another page's look-alike
// would pass, and answers `visible` unknown); else, for a part whose first step
// navigates to a literal address on its own site, no check and `selfArrives`
// (the part brings its own page); else none, which the runner refuses.
import type { AutomationStudioSubflowCardCheck } from "@fluxiq/contracts/automation";
import type { AutomationStudioSubflowContract } from "../../../engine/automation/lifecycle/index.ts";
import { partCheckOf } from "./condition-digest.ts";
import { partControlTargetOf } from "./control-target.ts";
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
  const target = first ? partControlTargetOf(first, input.controlKeys) : undefined;
  if (target) {
    const conditions = [{ fact: "visible", op: "visible" as const, target: structuredClone(target) }];
    const check = partCheckOf(conditions, "The control the first step uses is on the page.");
    return { start: { source: "first_step", conditions }, ...(check ? { check } : {}) };
  }
  if (first && partStepNavigates(first)) {
    const origin = partOriginOf(first.params.url);
    if (origin && input.sites.includes(origin)) return { start: { source: "navigate", conditions: [], selfArrives: true } };
  }
  return { start: { source: "none", conditions: [] } };
}

