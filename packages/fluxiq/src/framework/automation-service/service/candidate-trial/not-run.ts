// The steps a trial never ran on some passes, from its act ledger (t796,
// `./act-ledger.ts`). Pure.
//
// One entry per step and reason, the passes it was not run on in order: a step
// a guard routed past (`guarded`, with the guard's label as `after`), whatever
// it does, and a step that does a lasting act that a pass never reached
// (`unreached`). A step that does no lasting act and was merely not reached is
// left out: a run that stopped early says so by its own failure, and only an
// act not done, or a guard gone past, is news the step list cannot carry.
// Inside a repeat each carries `of`, its passes; outside one its passes are
// `[1]` and it carries no `of`.
//
// The feedback lists these under `notRun` with Core's sentence (`./feedback.ts`),
// and the trial's change reads a part whose acting steps are all among them on
// every pass as not run (`../../flow-bootstrap/trial-change/proof.ts`).

import type { AutomationStudioTrialActLedgerEntry, AutomationStudioTrialNotRunStep } from "./contracts.ts";

/** The steps not run on some passes (header), in the ledger's order. */
export function automationStudioTrialNotRun(ledger: readonly AutomationStudioTrialActLedgerEntry[]): AutomationStudioTrialNotRunStep[] {
  const out: AutomationStudioTrialNotRunStep[] = [];
  for (const entry of ledger) {
    const groups = new Map<string, AutomationStudioTrialNotRunStep>();
    entry.passes.forEach((pass, index) => {
      if (pass.status !== "not_run") return;
      if (pass.why === "unreached" && !entry.lasting) return;
      const after = pass.why === "guarded" ? pass.after : undefined;
      const id = `${pass.why}\u0000${after ?? ""}`;
      const group: AutomationStudioTrialNotRunStep = groups.get(id) ?? {
        nodeId: entry.nodeId, definitionId: entry.definitionId, label: entry.label, ...(entry.key !== undefined ? { key: entry.key } : {}),
        reason: pass.why, ...(after !== undefined ? { after } : {}), passes: [], ...(entry.repeat ? { of: entry.repeat.passes } : {}), lasting: entry.lasting
      };
      group.passes.push(pass.pass ?? index + 1);
      groups.set(id, group);
    });
    out.push(...groups.values());
  }
  return out;
}
