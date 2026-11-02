import type { AutomationStudioActionPermissionActionKind } from "./action-kind.ts";
import type { AutomationStudioActionConsequence } from "../../../../components/automation/action-effect/consequences/index.ts";

/** The action a request is about, as Core names it. */
export type AutomationStudioActionPermissionAction = {
  kind: AutomationStudioActionPermissionActionKind;
  id: string;
  ref: string;
  /**
   * Present when the action undoes a lasting act this same build made (t462:
   * a candidate build resets the site before it re-runs its Flow). `act` names
   * that act; `allowed` lists the gated classes undoing it may have without
   * asking, for this one action only -- deleting what the build itself
   * created. What an act was, and so what undoing it may do, is decided by the
   * build's site-reset ledger, never by the gate. The same shape as
   * `AutomationStudioSiteResetUndo` (`../flow-bootstrap/site-reset/contracts.ts`),
   * written out here because this module never imports upward.
   */
  undoes?: { act: string; allowed: readonly AutomationStudioActionConsequence[] };
};
