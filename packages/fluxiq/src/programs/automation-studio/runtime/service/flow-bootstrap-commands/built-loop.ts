// How an evidence-guided build's phases ended, as the service reads it once
// they have stopped: every ending that is not a Flow is thrown as the build's
// failure, in the order the service always read them, and what is left is the
// loop that accepted a Flow.
//
// **Why it is its own module.** It is one decision the service made inline
// beside the build's setup, and `../../service.ts` is past its size limit; the
// order below is the contract, so it is kept whole in one place.

import type { AutomationStudioBootstrapAccounting, AutomationStudioFlowBootstrapActionPermissions, AutomationStudioFlowBootstrapBuildPhasesOutcome, AutomationStudioFlowBootstrapIncompleteDraftKeeper, AutomationStudioFlowBootstrapPersonNeeded } from "../../flow-bootstrap/index.ts";
import { flowBootstrapBuildEndingFailure, flowBootstrapEvidenceLoopFailure } from "../../flow-bootstrap/index.ts";
import type { AutomationStudioLlmEvidenceLoopResult } from "../../llm/index.ts";
import type { AutomationStudioFlowBootstrapCreationPurse } from "./creation-purse.ts";

/** The loop a build's phases left with a Flow, or a throw of the ending that stopped it short. */
export async function automationStudioFlowBootstrapBuiltLoop(input: {
  built: AutomationStudioFlowBootstrapBuildPhasesOutcome;
  /** The build's share of its creation's purse: a build ended not doable ends the creation. */
  creation: Pick<AutomationStudioFlowBootstrapCreationPurse, "ended">;
  /** The build's accounting of what a loop spent, the authority's reading included. */
  accounting(spent: AutomationStudioLlmEvidenceLoopResult["accounting"]): AutomationStudioBootstrapAccounting;
  permissions: Pick<AutomationStudioFlowBootstrapActionPermissions, "endedOnRequest">;
  personNeeded: Pick<AutomationStudioFlowBootstrapPersonNeeded, "endedOnIntervention">;
  /** Whether the completion check accepted a plan. */
  accepted: boolean;
  keeper: Pick<AutomationStudioFlowBootstrapIncompleteDraftKeeper, "exhausted">;
}): Promise<{ built: Exclude<AutomationStudioFlowBootstrapBuildPhasesOutcome, { kind: "unfinished" }>; loop: Extract<AutomationStudioLlmEvidenceLoopResult, { ok: true }> }> {
  const { built, accounting } = input;
  if (built.kind === "unfinished") {
    input.creation.ended(built.ending.kind === "not_doable");
    throw flowBootstrapBuildEndingFailure(built.ending, built.progress, accounting(built.accounting), built.kept, built.lastIssueCodes);
  }
  const loop = built.kind === "ended" ? { ...built.loop, trace: built.trace, accounting: built.accounting } : built.loop; // Keep every round before publishing the person/permission ending.
  const personStopped = input.personNeeded.endedOnIntervention(loop, accounting(loop.accounting));
  if (personStopped && !loop.ok) throw personStopped;
  // A request ends the build only when the build produced nothing. A
  // plan the completion check accepted is still a Flow worth having,
  // and the request travels with it instead of discarding it: the
  // person answers before it is applied (`../../flow-bootstrap/adaptation.ts`).
  const askedPermission = input.permissions.endedOnRequest(loop, accounting(loop.accounting));
  if (askedPermission && !input.accepted) throw askedPermission;
  if (!loop.ok) throw await input.keeper.exhausted(loop, (kept) => flowBootstrapEvidenceLoopFailure(loop, accounting(built.accounting), kept));
  return { built, loop };
}
