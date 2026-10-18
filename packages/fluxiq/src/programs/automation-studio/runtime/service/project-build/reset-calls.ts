import type { AutomationStudioSiteResetCalls, AutomationStudioSiteResetLedger, AutomationStudioSiteResetPlace, AutomationStudioSiteResetRead, AutomationStudioSiteResetProjectLedger } from "../../flow-bootstrap/site-reset/index.ts";

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
//
// The same routing serves the reads around each call (`./brief-ports.ts`,
// `flow-bootstrap/site-reset/act-places.ts`): what an undo did to its page is
// told to the act's owner, and where an act of the reset's own was made, to the
// reset's ledger.

export function automationStudioProjectBuildResetCalls(project: AutomationStudioSiteResetProjectLedger, own: AutomationStudioSiteResetLedger): AutomationStudioSiteResetCalls & {
  observed(read: AutomationStudioSiteResetRead): void;
  actOf(callId: string): string | undefined;
  placed(act: string, place: AutomationStudioSiteResetPlace): void;
  undoSeen(act: string, changedInPlace: boolean): void;
  noEffect(act: string): void;
} {
  const owner = (act: unknown): AutomationStudioSiteResetLedger => {
    const found = typeof act === "string" ? project.snapshot().acts.find((entry) => entry.act === act) : undefined;
    return found ? project.forBrief(found.owner) : own;
  };
  return {
    observed: (read) => {
      project.observed(read);
      own.observed(read);
      // The reset sees the resource it is undoing. Update evidence for acts
      // already owned elsewhere, but never seed a different brief's baseline:
      // independent resources must have different opaque scopes. Only original
      // pre-effect project authority, adopted explicitly, can seed another owner.
      for (const brief of new Set(project.snapshot().acts.map((act) => act.owner))) {
        const ledger = project.forBrief(brief);
        if (ledger !== own) ledger.observed(read, false);
      }
    },
    claim: (undoes) => owner(undoes).claim(undoes),
    target: (act, declared) => owner(act).target(act, declared),
    explored: (call) => owner(call.undoes).explored(call),
    actOf: (callId) => own.actOf(callId),
    placed: (act, place) => owner(act).placed(act, place),
    undoSeen: (act, changedInPlace) => owner(act).undoSeen(act, changedInPlace),
    noEffect: (act) => owner(act).noEffect(act)
  };
}
