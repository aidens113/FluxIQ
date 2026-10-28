// What a trial starts with (t462, t471; t775: reset as rarely as possible).
//
// A trial or the judged whole run is judged against the state recorded just
// before it and the change the task asks for (user, 2026-10-27, AGENTS.md
// "Reset as rarely as possible"). So this build's acts on the site never
// refuse a trial: acts still in place, acts kept because the site cannot undo
// them, acts settled with no change seen, acts no call can settle (t743) and a
// start that differs from how the build found it are all said, under
// `startedWith`, to the model and to the trial's judge, and the trial runs.
// The before-state itself is read by the trial's own readings
// (`../trial-change/`), which the judge sees as `siteChange`.
//
// The one refusal left before a trial is targeted and lives in the ledger
// (`./ledger.ts`, `endStateClash`): a step whose asked end state is already
// shown by this build's own act made by another step, with no earlier act of
// that step seen making it, is refused `candidate.trial_starts_in_end_state`,
// naming just that act. Pure.

import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioSiteResetNamedAct, AutomationStudioSiteResetUnsettleableAct } from "./contracts.ts";
import { AUTOMATION_STUDIO_SITE_RESET_WORDS as WORDS } from "./words.ts";

/** What a trial starts with (header): absent when nothing of the build is on the site and the start does not differ. */
export function automationStudioSiteResetTrialPolicy(input: {
  /** This build's acts still in place, as the model is shown them. */
  inPlace: readonly AutomationStudioSiteResetNamedAct[];
  /** This build's acts kept because the site cannot undo them, or settled with no change seen. */
  kept?: readonly AutomationStudioSiteResetNamedAct[];
  /** This build's acts no call can settle (t743): on the site, said apart. */
  unsettleable?: readonly AutomationStudioSiteResetUnsettleableAct[];
  /** What still differs from how the build found it, where the start check could say. */
  differs?: readonly string[];
}): { kind: "admit"; startedWith?: JsonObject } {
  const acts = [...input.inPlace.map(named), ...(input.unsettleable ?? []).map(unsettled)];
  const kept = (input.kept ?? []).map(named);
  const differs = [...(input.differs ?? [])];
  if (!acts.length && !kept.length && !differs.length) return { kind: "admit" };
  return { kind: "admit", startedWith: { ...(acts.length ? { acts } : {}), ...(differs.length ? { differs } : {}), ...(kept.length ? { cannotUndo: kept } : {}), instruction: WORDS.startedWith(kept.length > 0) } };
}

/** An act no call can settle as the model is shown it (t743), with no key it does not have. */
function unsettled(act: AutomationStudioSiteResetUnsettleableAct): JsonObject {
  return { act: act.act, did: act.did, ...(act.call ? { call: act.call } : {}), reason: act.reason, failed: act.failed };
}

/** An act as the model is shown it, with no key it does not have. */
function named(act: AutomationStudioSiteResetNamedAct): JsonObject {
  return { act: act.act, did: act.did, ...(act.call ? { call: act.call } : {}), ...(act.stillThere?.length ? { stillThere: [...act.stillThere] } : {}) };
}
