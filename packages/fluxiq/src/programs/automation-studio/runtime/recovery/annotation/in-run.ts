// What makes one recovery an in-run repair (state-aware recovery plan, C6
// step 8): the same four stages, gates, interventions, budget and usage
// records as a recovery after the run (`./annotate.ts`), entered at a true
// failure while the run is held at its failing step.
//
// Three things differ, and this is where each is supplied:
//
// - `slot`: the patch request carries the incident's unit, its contract, the
//   incident and what the run already tried and did, and the plan offers a
//   handler (`add_handler`) and a unit's replacement (`replace_unit`) beside
//   today's kinds;
// - `apply`: the patches are overlaid on the held run's graph rather than
//   tried on a clone and resumed from; the executor's re-attempt of the unit is
//   the trial, and nothing is saved before the run's judged end;
// - `purse`: one cost ceiling for the whole run, drawn on by every incident it
//   asks about, rather than one per recovery.

import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioActionPermissionGate } from "../../action-permissions/index.ts";
import type {
  AutomationStudioLlmContextPacket,
  AutomationStudioLlmInRunRepairContext,
  AutomationStudioLlmRunBudgetLedger,
  AutomationStudioRuntimePatch
} from "../../llm/index.ts";
import type { AutomationStudioRuntimePatchKind } from "../plan.ts";
import type { AutomationStudioRuntimeRecoveryPatchOutcome } from "./patches.ts";
import type { AutomationStudioRecoveryRunBudget } from "./run-budget.ts";

/** A recovery made while the run is held at its failing step. */
export type AutomationStudioInRunRecovery = {
  /** What the patch request is held to: the unit, its contract, the incident and the run's history. */
  slot: AutomationStudioLlmInRunRepairContext;
  /** The run's one purse, opened by its first in-run recovery that resolves a model and drawn on by every later one. */
  purse: { current?: { budget: AutomationStudioRecoveryRunBudget; ledger: AutomationStudioLlmRunBudgetLedger } };
  /**
   * Overlays the model's patches on the held run, under the recovery's one
   * permission gate. Returns what the run detail records; the overlay itself
   * stays with the caller, which hands it to the executor.
   */
  apply(input: {
    patches: readonly AutomationStudioRuntimePatch[];
    allowedPatchKinds: readonly AutomationStudioRuntimePatchKind[];
    /** The failure packet the model was shown, which a target override is checked against. */
    failureEvidence?: JsonObject;
    /** The explored packets exactly as the patch request carried them. */
    explorationEvidence?: AutomationStudioLlmContextPacket["explorationEvidence"];
    /** Present exactly when reusable context was consulted. */
    reusableContextMetadata?: JsonObject;
    /** The recovery's one permission gate, which a fix that would lastingly act is asked first. */
    permissionGate?: AutomationStudioActionPermissionGate;
  }): Promise<AutomationStudioRuntimeRecoveryPatchOutcome>;
};
