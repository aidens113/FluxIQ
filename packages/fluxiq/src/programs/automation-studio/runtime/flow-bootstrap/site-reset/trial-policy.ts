// Whether a trial may run on the site as it stands (t462).
//
// Pure: the ledger (`./ledger.ts`) gives it the phase it keeps and the start
// check's comparison, and applies what it answers. The rule:
//
// - Not due (no act recorded since the build began or since the last trial,
//   and none still in place): the trial runs, and nothing is compared. Acts an
//   earlier trial was admitted with keep it due: every trial asks again.
// - Due, and the start check finds nothing different: the site is back, every
//   act is marked undone and the trial runs.
// - Otherwise it is refused as `candidate.trial_reset_required` while acts of
//   this build are in place, or, with none in place but the start still
//   different, as `candidate.trial_start_differs` once per phase.
// - It never deadlocks. The candidate wrap-up leaves the model only submit and
//   test, so a reset demanded there could never be made: a refusal identical to
//   the last one (no progress), or one past `MAX_REFUSALS` in a phase, admits
//   the trial instead, saying under `startedWith` what was still in place or
//   different.

import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioSiteResetComparison, AutomationStudioSiteResetNamedAct } from "./contracts.ts";
import { AUTOMATION_STUDIO_SITE_RESET_WORDS as WORDS } from "./words.ts";

/** Refusals of one phase; the next one admits the trial instead. */
const MAX_REFUSALS = 3;

/** What the ledger keeps of the current phase for the policy. */
export type AutomationStudioSiteResetPhase = {
  /** Acts recorded since the build began or since the last trial. */
  recorded: number;
  refusals: number;
  startDiffersSent: boolean;
  /** The in-place acts and differences the last refusal of this phase named. */
  lastRefusal?: string;
};

export type AutomationStudioSiteResetPolicyAnswer =
  | { kind: "admit"; allUndone: boolean; startedWith?: JsonObject }
  | { kind: "refuse"; evidence: JsonObject & { code: string }; signature: string; startDiffers: boolean };

/** The policy before one trial; `compare` is asked only when a reset is due. */
export async function automationStudioSiteResetTrialPolicy(input: {
  phase: Readonly<AutomationStudioSiteResetPhase>;
  inPlace: readonly AutomationStudioSiteResetNamedAct[];
  compare: () => Promise<AutomationStudioSiteResetComparison>;
}): Promise<AutomationStudioSiteResetPolicyAnswer & { moved: boolean }> {
  if (input.phase.recorded === 0 && input.inPlace.length === 0) return { kind: "admit", allUndone: false, moved: false };
  const comparison = await input.compare();
  const moved = comparison.moved;
  if (comparison.differs && comparison.differs.length === 0) return { kind: "admit", allUndone: true, moved };
  const differs = comparison.differs ?? [];
  const acts = input.inPlace.map((act) => ({ act: act.act, did: act.did, ...(act.call ? { call: act.call } : {}) }));
  if (!acts.length && !differs.length) return { kind: "admit", allUndone: false, moved };
  const signature = JSON.stringify([acts.map((act) => act.act), differs]);
  const startedWith: JsonObject = { ...(acts.length ? { acts } : {}), ...(differs.length ? { differs: [...differs] } : {}) };
  const stalled = input.phase.lastRefusal === signature || input.phase.refusals >= MAX_REFUSALS;
  if (stalled || (!acts.length && input.phase.startDiffersSent)) return { kind: "admit", allUndone: false, startedWith, moved };
  if (acts.length) {
    const code = "candidate.trial_reset_required";
    return { kind: "refuse", signature, startDiffers: false, moved, evidence: { ok: false, code, instruction: WORDS.resetRequired(differs.length > 0), actsToUndo: acts, ...(differs.length ? { differs: [...differs] } : {}) } };
  }
  const code = "candidate.trial_start_differs";
  return { kind: "refuse", signature, startDiffers: true, moved, evidence: { ok: false, code, instruction: WORDS.startDiffers(), differs: [...differs] } };
}
