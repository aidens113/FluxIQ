// The ledger of this build's own lasting acts (t462: a build resets the site
// before it re-runs its Flow; user, 2026-10-12).
//
// Candidate mode had no record of what a build left on the site: the draft
// steps that carry it exist only in legacy mode. So the build's permission
// wrapper (`../action-permissions.ts`) tells this ledger every exploration call
// it ran (`explored`), and the trial gate tells it each trial's own lasting
// acts (`trialRan`). Each becomes an act `act-N`, numbered once and never
// reused, which the model names under `undoes` on the `core.run_node` call
// that reverses it (`claim`).
//
// - An act is recorded only when it landed, was permitted, applied an effect
//   ("mutate") and declared a lasting class: `create_new`, `modify_existing` or
//   `delete`. One declaring `move_money` or `send_or_publish` cannot be undone
//   through the site, so it is recorded as such and never asked for.
// - Undoing an act that created something may remove it without asking
//   (`allowed: ["delete"]`), once per act: the allowance is spent only by an
//   undo of that act that landed having declared `delete` (t471). Lane B round
//   9 (`run-mv5q4j33-d04ac463`) went to the cart under `undoes: "act-2"` first,
//   which spent act-2's allowance on a navigation. A claim on an act whose
//   allowance is spent is refused before anything runs
//   (`candidate.undo_already_done`), naming the call that spent it: in the same
//   run the model then pressed Remove on the line the cart held before the
//   build began under `undoes: "act-3"`, was rightly asked, and sent it three
//   more times until the build ended. Anything else is gated exactly as any
//   call is, so an act on what was there before the build began still asks.
//
// **An undo counts only when the act's effect is gone (t471).** A call that
// names an act never marks it undone. Lane D round 9
// (`run-mv5q4j2n-25784472`) clicked the static words of a confirmed request
// under `undoes`, and that click "landed". Instead the build's candidate loop
// reads each act's own page just before and just after it (`placed`), and
// before a trial the reset goes back to that page and looks: the act is undone
// once none of what it changed there is still there (`beforeTrial`). An act
// with no such place -- a trial's act, or one whose page could not be read --
// counts as undone once an undo of it landed and changed the page it was made
// on (`undoSeen`); where the target cannot be read at all, a landed undo counts
// as it did before.
//
// **An act the site cannot undo does not trap the build.** An act still there
// after the reset asked for it twice, or one the model names under
// `cannotUndo` once the reset has asked for it, is kept: never asked for
// again, and every trial runs with it in place, saying so under
// `startedWith.cannotUndo` (`./trial-policy.ts`).
//
// A phase runs from the build's start, or from one trial to the next. The
// policy before a trial (`./trial-policy.ts`) reads it.

import type { AutomationStudioActionConsequence } from "../../action-permissions/index.ts";
import type {
  AutomationStudioSiteResetCalls,
  AutomationStudioSiteResetChecks,
  AutomationStudioSiteResetClaim,
  AutomationStudioSiteResetComparison,
  AutomationStudioSiteResetDecision,
  AutomationStudioSiteResetExplored,
  AutomationStudioSiteResetNamedAct,
  AutomationStudioSiteResetPlace,
  AutomationStudioSiteResetTrialAct
} from "./contracts.ts";
import { automationStudioSiteResetTrialPolicy, type AutomationStudioSiteResetPhase } from "./trial-policy.ts";
import { AUTOMATION_STUDIO_SITE_RESET_WORDS as WORDS } from "./words.ts";

/** The classes an act may leave that the site's own controls can reverse. */
const UNDOABLE: ReadonlySet<AutomationStudioActionConsequence> = new Set(["create_new", "modify_existing", "delete"]);
/** The classes no control of the site takes back. */
const IRREVERSIBLE: ReadonlySet<AutomationStudioActionConsequence> = new Set(["move_money", "send_or_publish"]);
/** The highest act number `undoes` can name (`^act-[1-9][0-9]{0,3}$`); no build comes near it, and past it nothing more is recorded. */
const MAX_ACT = 9999;
/** Reset refusals that named an act still there, after which it is kept: the site is taken to offer no way to undo it. */
const ASKED_BEFORE_KEPT = 2;

type Act = {
  id: string;
  did: string;
  /** The exploration call, or the trial step, that made it. */
  ref: string;
  /** The exploration call's id, as the model gave it; absent for a trial's act. */
  call?: string;
  created: boolean;
  undoable: boolean;
  undone: boolean;
  /** The call that last tried to undo it, as the model gave its id. */
  undoneBy?: string;
  /** Undo calls of it that landed. */
  attempts: number;
  /** Whether a landed undo changed the page it ran on and stayed there: unknown when no read was made. */
  undoChanged?: boolean;
  /** An undo of it landed having declared `delete`: its one unasked removal is spent. */
  spent: boolean;
  /** Its own page before it, and what it changed there. */
  place?: AutomationStudioSiteResetPlace;
  /** What it changed that was still there when the reset last looked. */
  stillThere?: string[];
  /** Reset refusals that named it. */
  askedFor: number;
  /** The site cannot undo it: every trial runs with it in place. */
  kept: boolean;
};

export class AutomationStudioSiteResetLedger implements AutomationStudioSiteResetCalls {
  private readonly acts: Act[] = [];
  private next = 1;
  private phase: AutomationStudioSiteResetPhase = { recorded: 0, refusals: 0, startDiffersSent: false };

  claim(undoes: unknown): AutomationStudioSiteResetClaim {
    if (undoes === undefined) return { kind: "none" };
    const act = typeof undoes === "string" ? this.acts.find((entry) => entry.id === undoes) : undefined;
    if (act?.kept && !act.undone) return { kind: "refused", evidence: { ok: false, code: "candidate.undo_act_kept", act: act.id, instruction: WORDS.keptAct(), actsToUndo: this.inPlace() } };
    if (!act || !this.toUndo(act)) {
      const actsToUndo = this.inPlace();
      return { kind: "refused", evidence: { ok: false, code: "candidate.undo_unknown_act", instruction: WORDS.unknownAct(actsToUndo.length > 0), actsToUndo } };
    }
    if (act.spent) {
      // Acts an undo already landed on are checked before the trial; the model is pointed only at those nobody has tried.
      const actsToUndo = this.acts.filter((entry) => this.toUndo(entry) && entry !== act && !(entry.attempts > 0 && entry.undoChanged !== false)).map(namedAct);
      return { kind: "refused", evidence: { ok: false, code: "candidate.undo_already_done", act: act.id, ...(act.undoneBy ? { undoneBy: act.undoneBy } : {}), instruction: WORDS.alreadyUndone(actsToUndo.length > 0), actsToUndo } };
    }
    return { kind: "undo", undo: { act: act.id, allowed: act.created ? ["delete"] : [] } };
  }

  explored(call: AutomationStudioSiteResetExplored): void {
    if (!call.landed) return;
    const declared = call.declared;
    if (call.undoes !== undefined) {
      const act = this.acts.find((entry) => entry.id === call.undoes);
      // Only a call that acted on the site is an attempt: a look, or a call the gate refused, leaves the act as it was.
      if (!act || !this.toUndo(act) || act.spent || !declared?.permitted || declared.effect !== "mutate") return;
      act.attempts += 1;
      act.undoneBy = call.callId;
      if (act.created && declared.consequences.includes("delete")) act.spent = true;
      return;
    }
    if (!declared?.permitted || declared.effect !== "mutate") return;
    const words = [declared.verb, declared.control.name === null ? "" : JSON.stringify(declared.control.name), declared.control.kind ?? ""];
    this.record(words.filter((word) => word.trim()).join(" ").trim(), call.callId, declared.consequences, call.callId);
  }

  /** The act the exploration call `callId` made, if it made one. */
  actOf(callId: string): string | undefined {
    return [...this.acts].reverse().find((act) => act.call === callId)?.id;
  }

  /** Where `act` was made: its page before it, and what it changed there. Nothing changed there, nothing to look for. */
  placed(act: string, place: AutomationStudioSiteResetPlace): void {
    const entry = this.acts.find((candidate) => candidate.id === act);
    if (entry && place.changed.length > 0) {
      entry.place = { state: structuredClone(place.state), location: place.location, changed: [...place.changed], ...(place.lines ? { lines: { gone: [...place.lines.gone], added: [...place.lines.added] } } : {}) };
    }
  }

  /** What an undo of `act` did to the page it ran on: whether it changed that page and stayed on it. */
  undoSeen(act: string, changedInPlace: boolean): void {
    const entry = this.acts.find((candidate) => candidate.id === act);
    if (entry) entry.undoChanged = (entry.undoChanged ?? false) || changedInPlace;
  }

  /**
   * The reset before a trial: acts named under `cannotUndo` kept, every act
   * still to undo looked for on its own page, then the policy applied to this
   * phase. `checks.compare` is asked only when a reset is due.
   */
  async beforeTrial(checks: AutomationStudioSiteResetChecks | AutomationStudioSiteResetChecks["compare"], cannotUndo?: readonly string[]): Promise<AutomationStudioSiteResetDecision> {
    const asked: AutomationStudioSiteResetChecks = typeof checks === "function" ? { compare: checks } : checks;
    for (const id of cannotUndo ?? []) {
      const act = this.acts.find((entry) => entry.id === id);
      // Only an act the reset has already asked for: the model has seen it listed, and had the chance to try.
      if (act && this.toUndo(act) && act.askedFor > 0) act.kept = true;
    }
    let moved = false;
    for (const act of this.acts.filter((entry) => this.toUndo(entry))) {
      const looked = act.place && asked.compareAt ? await asked.compareAt(act.place) : undefined;
      moved = moved || looked?.moved === true;
      if (looked?.differs && act.place) {
        act.stillThere = this.stillThere(act, act.place, looked);
        if (!act.stillThere.length) act.undone = true;
      } else if (act.attempts > 0 && act.undoChanged !== false) {
        act.undone = true;
      }
      if (!act.undone && act.askedFor >= ASKED_BEFORE_KEPT) act.kept = true;
    }
    const kept = this.acts.filter((act) => act.undoable && !act.undone && act.kept).map(namedAct);
    const answer = await automationStudioSiteResetTrialPolicy({ phase: { ...this.phase }, inPlace: this.inPlace(), kept, compare: asked.compare });
    if (answer.kind === "refuse") {
      this.phase = { ...this.phase, refusals: this.phase.refusals + 1, lastRefusal: answer.signature, startDiffersSent: this.phase.startDiffersSent || answer.startDiffers };
      for (const act of this.acts) if (this.toUndo(act)) act.askedFor += 1;
      return { kind: "refuse", evidence: answer.evidence, moved: moved || answer.moved };
    }
    // A trial admitted with acts still to undo -- the reset made no progress, or was asked too often -- runs with them, and so will every later one.
    if (answer.startedWith?.acts !== undefined) for (const act of this.acts) if (this.toUndo(act)) act.kept = true;
    return { kind: "admit", ...(answer.startedWith ? { startedWith: answer.startedWith } : {}) };
  }

  /** A trial ran: a new phase starts with what was still in place and the trial's own acts, which are answered as left on the site. */
  trialRan(acts: readonly AutomationStudioSiteResetTrialAct[], trialRunId?: string): AutomationStudioSiteResetNamedAct[] {
    this.phase = { recorded: 0, refusals: 0, startDiffersSent: false };
    for (const act of acts) {
      const label = act.label ? JSON.stringify(act.label) : act.definitionId;
      const did = `trial step ${act.step} ${label}${act.control ? ` on ${JSON.stringify(act.control)}` : ""}`;
      this.record(did, `${trialRunId ?? "trial"}#step-${act.step}`, act.consequences);
    }
    return this.acts.filter((act) => act.undoable && !act.undone).map(namedAct);
  }

  /**
   * What `act` changed on its page that is still there now. With the domain's
   * lines: each line it added still present, and each line it removed still
   * gone -- unless another act of this build added that line, as when two acts
   * each change one total: the later act's "removal" of the total the earlier
   * one wrote is that earlier act's to undo, not its own. Without them, each of
   * its worded changes that is still a difference.
   */
  private stillThere(act: Act, place: AutomationStudioSiteResetPlace, looked: AutomationStudioSiteResetComparison): string[] {
    if (place.lines && looked.lines) {
      const nowAdded = new Set(looked.lines.added), nowGone = new Set(looked.lines.gone);
      const addedByOthers = new Set(this.acts.filter((other) => other !== act).flatMap((other) => other.place?.lines?.added ?? []));
      return [...place.lines.added.filter((line) => nowAdded.has(line)), ...place.lines.gone.filter((line) => nowGone.has(line) && !addedByOthers.has(line))];
    }
    const now = new Set(looked.differs ?? []);
    return place.changed.filter((change) => now.has(change));
  }

  /** This build's acts still to undo, as the model is shown them. */
  inPlace(): AutomationStudioSiteResetNamedAct[] {
    return this.acts.filter((act) => this.toUndo(act)).map(namedAct);
  }

  /** Still on the site, and still the model's to undo. */
  private toUndo(act: Act): boolean {
    return act.undoable && !act.undone && !act.kept;
  }

  private record(did: string, ref: string, consequences: readonly AutomationStudioActionConsequence[], call?: string): void {
    const lasting = consequences.some((consequence) => UNDOABLE.has(consequence) || IRREVERSIBLE.has(consequence));
    if (!lasting || this.next > MAX_ACT) return;
    const undoable = !consequences.some((consequence) => IRREVERSIBLE.has(consequence));
    this.acts.push({ id: `act-${this.next}`, did: did || "an act", ref, ...(call ? { call } : {}), created: consequences.includes("create_new"), undoable, undone: false, attempts: 0, spent: false, askedFor: 0, kept: false });
    this.next += 1;
    this.phase = { ...this.phase, recorded: this.phase.recorded + 1 };
  }
}

/** An act as the model is shown it. */
function namedAct(act: Act): AutomationStudioSiteResetNamedAct {
  return { act: act.id, did: act.did, ...(act.call ? { call: act.call } : {}), ...(act.stillThere?.length ? { stillThere: [...act.stillThere] } : {}) };
}
