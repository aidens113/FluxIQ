// A project ledger's snapshot as merged acts (`flow-bootstrap/site-reset/project-ledger.ts`).

import type { AutomationStudioSiteResetProjectSnapshot } from "../../../../flow-authoring/bootstrap/site-reset/index.ts";
import type { AutomationStudioAttemptActMerged } from "../../contracts.ts";

/** Each act of the snapshot: taken back where its brief's settlement says so, may-have-landed where it can only say possibly, else landed. A possibly lasting press stays undeclared. */
export function automationStudioAttemptActsFromProjectLedger(snapshot: AutomationStudioSiteResetProjectSnapshot): AutomationStudioAttemptActMerged[] {
  return snapshot.acts.map((act) => ({
    sourceId: act.act,
    what: act.did,
    state: act.left === "no" ? "undone" : act.left === "possibly" || act.possible ? "may_have_landed" : "landed",
    ...(act.possible ? { undeclared: true as const } : {}),
    stage: "trial"
  }));
}
