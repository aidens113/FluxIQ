import type { AutomationStudioSiteResetCalls, AutomationStudioSiteResetLedger, AutomationStudioSiteResetProjectLedger } from "../../flow-bootstrap/site-reset/index.ts";

// What a reset brief's permission gate tells the ledger (unit A5c). A reset
// undoes acts other agents made -- each builder's, and the supervisor's whole
// trials' -- and each act lives in its owner's ledger of the project ledger
// (`flow-bootstrap/site-reset/project-ledger.ts`), numbered once across the
// build. So an undo is put to the ledger that owns the act it names: the claim,
// each control it acts on, and the call once it ran. That ledger then judges
// the undo exactly as it judges its own brief's (its own item, what it created,
// the site's one confirmation), and counts it towards the act being undone.
// A call that names no act is the reset's own, and goes to the reset brief's
// ledger, which records any lasting act the reset itself made.

export function automationStudioProjectBuildResetCalls(project: AutomationStudioSiteResetProjectLedger, own: AutomationStudioSiteResetLedger): AutomationStudioSiteResetCalls {
  const owner = (act: unknown): AutomationStudioSiteResetLedger => {
    const found = typeof act === "string" ? project.snapshot().acts.find((entry) => entry.act === act) : undefined;
    return found ? project.forBrief(found.owner) : own;
  };
  return {
    claim: (undoes) => owner(undoes).claim(undoes),
    target: (act, declared) => owner(act).target(act, declared),
    explored: (call) => owner(call.undoes).explored(call)
  };
}
