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
// - An act still to undo refuses every trial, however often it is asked (F1
//   continuation; user, 2026-10-12: before every trial and the judged whole run
//   the build's own lasting acts are undone, and only an act the site truly
//   cannot undo may stay). This once admitted a refusal identical to the last
//   (no progress), or one past `MAX_REFUSALS` in a phase, on the leftovers: F3
//   (`fix-f3-reset-brief-preflight.md`) saw a whole trial run on two acts a
//   blocked reset never undid. An act stays only once it is kept -- the model
//   named it under `cannotUndo`, or its undo was refused -- and the trial then
//   runs with it, its judge told.
// - A start that only differs never deadlocks: with no act to undo, a
//   difference identical to the last refusal's, or past `MAX_REFUSALS`, admits
//   the trial, saying under `startedWith` what differed.
// - An act no call can settle (`gate_unsatisfiable`, t743) refuses every trial
//   too, listed apart under `actsUnsettleable`; with nothing else to undo the
//   refusal says no call can meet it (`acts_unsettleable`, `no_call`) and
//   offers the honest exit: end the brief blocked, naming those acts. The
//   reset rule is not weakened for it.

import type { JsonObject } from "../../../../../core/index.ts";
import { automationStudioSiteResetRefusal as refusal } from "../reset-answers/index.ts";
import type { AutomationStudioSiteResetComparison, AutomationStudioSiteResetNamedAct, AutomationStudioSiteResetUnsettleableAct } from "./contracts.ts";
import { AUTOMATION_STUDIO_SITE_RESET_WORDS as WORDS } from "./words.ts";

/** Refusals of one phase over a start that only differs; the next one admits the trial instead. */
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
  /** This build's acts no call can settle (header, t743): never admitted, never asked to undo. */
  unsettleable?: readonly AutomationStudioSiteResetUnsettleableAct[];
  compare: () => Promise<AutomationStudioSiteResetComparison>;
}): Promise<AutomationStudioSiteResetPolicyAnswer & { moved: boolean }> {
  const kept = (input.kept ?? []).map(named);
  const unsettleable = (input.unsettleable ?? []).map(unsettled);
  const apart = unsettleable.length ? { actsUnsettleable: unsettleable } : {};
  const started = (extra: JsonObject = {}): { startedWith?: JsonObject } => {
    const startedWith: JsonObject = { ...extra, ...(kept.length ? { cannotUndo: kept } : {}) };
    return Object.keys(startedWith).length ? { startedWith: { ...startedWith, instruction: WORDS.startedWith(kept.length > 0) } } : {};
  };
  if (input.phase.recorded === 0 && input.inPlace.length === 0 && !unsettleable.length) return { kind: "admit", ...started(), moved: false };
  // Nothing to undo, but acts no call can settle: refused as they stand, with the honest exit (header, t743).
  if (input.inPlace.length === 0 && unsettleable.length) return { kind: "refuse", signature: JSON.stringify([unsettleable.map((act) => act.act)]), startDiffers: false, moved: false, evidence: refusal("candidate.trial_reset_required", { failed: "acts_unsettleable", canMeet: "no_call", instruction: WORDS.unsettleable(false), actsToUndo: [], ...apart, ...(kept.length ? { cannotUndo: kept } : {}) }) };
  const comparison = await input.compare();
  const moved = comparison.moved;
  const differs = comparison.differs ?? [];
  const acts = input.inPlace.map(named);
  // Nothing to undo: a clean start runs, and so does a different one when kept acts may be what makes it differ.
  if (!acts.length && (!differs.length || kept.length)) return { kind: "admit", ...started(differs.length ? { differs: [...differs] } : {}), moved };
  const signature = JSON.stringify([acts.map((act) => [act.act, act.stillThere ?? []]), differs]);
  // Acts still to undo are never admitted (header); only a difference with nothing to undo is.
  const stalled = input.phase.lastRefusal === signature || input.phase.refusals >= MAX_REFUSALS;
  if (!acts.length && (stalled || input.phase.startDiffersSent)) return { kind: "admit", ...started(differs.length ? { differs: [...differs] } : {}), moved };
  // Each refusal names its failed condition through `../reset-answers/` (t743); the acts' own settle says where a call can meet it.
  if (acts.length) return { kind: "refuse", signature, startDiffers: false, moved, evidence: refusal("candidate.trial_reset_required", { failed: "acts_in_place", canMeet: "another_page", instruction: WORDS.resetRequired(differs.length > 0) + (unsettleable.length ? ` ${WORDS.unsettleable(true)}` : ""), actsToUndo: acts, ...apart, ...(differs.length ? { differs: [...differs] } : {}), ...(kept.length ? { cannotUndo: kept } : {}) }) };
  return { kind: "refuse", signature, startDiffers: true, moved, evidence: refusal("candidate.trial_start_differs", { failed: "start_differs", canMeet: "another_page", instruction: WORDS.startDiffers(), differs: [...differs] }) };
}

/** An act no call can settle as the model is shown it (header, t743), with no key it does not have. */
function unsettled(act: AutomationStudioSiteResetUnsettleableAct): AutomationStudioSiteResetUnsettleableAct & JsonObject {
  return { act: act.act, did: act.did, ...(act.call ? { call: act.call } : {}), reason: act.reason, failed: act.failed };
}

/** An act as the model is shown it, with no key it does not have; an open act keeps what settles it (`settle`, L1). */
function named(act: AutomationStudioSiteResetNamedAct): AutomationStudioSiteResetNamedAct & JsonObject {
  return { act: act.act, did: act.did, ...(act.call ? { call: act.call } : {}), ...(act.stillThere?.length ? { stillThere: [...act.stillThere] } : {}), ...(act.settle ? { settle: act.settle } : {}) };
}
