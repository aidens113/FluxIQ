// Whether a trial may run on the site as it stands (t462, t471).
//
// Pure: the ledger (`./ledger.ts`) gives it the phase it keeps, the acts still
// to undo (each already looked for on its own page where it could be), the
// acts kept because the site cannot undo them, and the start check's
// comparison; it applies what this answers. The rule:
//
// - Not due (no act recorded since the build began or since the last trial,
//   and none still to undo): the trial runs, and nothing is compared. Acts an
//   earlier trial was admitted with keep it due: every trial asks again.
// - Acts to undo: refused as `candidate.trial_reset_required`, naming each and
//   what of it is still there. A clean start page never vouches for an act:
//   lane D round 9 (`run-mv5q4j2n-25784472`) started from a home page that
//   showed nothing of the requests its trial had confirmed, and the old rule
//   read "nothing differs there" as every act undone.
// - None to undo but the start still different: refused as
//   `candidate.trial_start_differs` once per phase -- unless acts are kept, in
//   which case the difference is presumed theirs and the trial runs.
// - Kept acts never block a trial: it runs with them in place, and says so
//   under `startedWith.cannotUndo`, which the model and the judge are shown.
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
  | { kind: "admit"; startedWith?: JsonObject }
  | { kind: "refuse"; evidence: JsonObject & { code: string }; signature: string; startDiffers: boolean };

/** The policy before one trial; `compare` is asked only when a reset is due. */
export async function automationStudioSiteResetTrialPolicy(input: {
  phase: Readonly<AutomationStudioSiteResetPhase>;
  /** This build's acts still to undo, as the model is shown them. */
  inPlace: readonly AutomationStudioSiteResetNamedAct[];
  /** This build's acts the site cannot undo, which the trial runs with. */
  kept?: readonly AutomationStudioSiteResetNamedAct[];
  compare: () => Promise<AutomationStudioSiteResetComparison>;
}): Promise<AutomationStudioSiteResetPolicyAnswer & { moved: boolean }> {
  const kept = (input.kept ?? []).map(named);
  const started = (extra: JsonObject = {}): { startedWith?: JsonObject } => {
    const startedWith: JsonObject = { ...extra, ...(kept.length ? { cannotUndo: kept } : {}) };
    return Object.keys(startedWith).length ? { startedWith: { ...startedWith, instruction: WORDS.startedWith(kept.length > 0) } } : {};
  };
  if (input.phase.recorded === 0 && input.inPlace.length === 0) return { kind: "admit", ...started(), moved: false };
  const comparison = await input.compare();
  const moved = comparison.moved;
  const differs = comparison.differs ?? [];
  const acts = input.inPlace.map(named);
  // Nothing to undo: a clean start runs, and so does a different one when kept acts may be what makes it differ.
  if (!acts.length && (!differs.length || kept.length)) return { kind: "admit", ...started(differs.length ? { differs: [...differs] } : {}), moved };
  const signature = JSON.stringify([acts.map((act) => [act.act, act.stillThere ?? []]), differs]);
  const stalled = input.phase.lastRefusal === signature || input.phase.refusals >= MAX_REFUSALS;
  if (stalled || (!acts.length && input.phase.startDiffersSent)) {
    return { kind: "admit", ...started({ ...(acts.length ? { acts } : {}), ...(differs.length ? { differs: [...differs] } : {}) }), moved };
  }
  if (acts.length) {
    const code = "candidate.trial_reset_required";
    return { kind: "refuse", signature, startDiffers: false, moved, evidence: { ok: false, code, instruction: WORDS.resetRequired(differs.length > 0), actsToUndo: acts, ...(differs.length ? { differs: [...differs] } : {}), ...(kept.length ? { cannotUndo: kept } : {}) } };
  }
  const code = "candidate.trial_start_differs";
  return { kind: "refuse", signature, startDiffers: true, moved, evidence: { ok: false, code, instruction: WORDS.startDiffers(), differs: [...differs] } };
}

/** An act as the model is shown it, with no key it does not have. */
function named(act: AutomationStudioSiteResetNamedAct): AutomationStudioSiteResetNamedAct & JsonObject {
  return { act: act.act, did: act.did, ...(act.call ? { call: act.call } : {}), ...(act.stillThere?.length ? { stillThere: [...act.stillThere] } : {}) };
}
