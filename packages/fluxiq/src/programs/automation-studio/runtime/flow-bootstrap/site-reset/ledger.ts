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
// - **An undo acts only on its own act's item (t475).** Each action an undo
//   call puts to the gate is read first (`target`), before the domain acts:
//   it is admitted on the item -- row, card, list item -- and dialog the act
//   itself acted on (the domain's opaque tokens on the declaration: t463 row
//   identity, t469 dialog identity), on an item the act itself created, in a
//   dialog the site opened to confirm that undo, or for a move with nothing
//   lasting and no item. Anything else is refused unrun
//   (`candidate.undo_wrong_target`) and never pressed. Lane D round 10
//   (`run-mv5tusge-1400ddf7`, `run-mv5upw4g-2482be12`) aimed Delete and
//   Confirm on other requests' rows under `undoes`; only an over-declared
//   `delete` stopped a Confirm on a row the build never touched.
// - **Only a positive identity match is the act's own item (t479).** The act's
//   item token and the control's must both be present and equal; a token
//   missing on either side is never a match, whatever else agrees. Lane B
//   round 11 (`run-mv5yaapd-ad19eaae`) undid an Add to cart that sat in no
//   row by pressing Remove on the cart's only line -- the dish soap the cart
//   held before the build -- because a one-line list names no row, and two
//   missing items compared equal. A dialog alone is no identity either: a
//   drawer can hold several lines no token tells apart. Where no reverse is
//   positively identified, the act is kept (`startedWith.cannotUndo`).
// - **One lasting press per confirmation (t479).** A dialog control with no
//   item follows an undo that landed on the act's own or created item only
//   once with a lasting class: the site's one confirmation. After it, the
//   chain is spent, and a further lasting press in a dialog is refused.
// - **Removing without asking is allowed only on what the act created
//   (t475).** An item counts as created only when the act's own page showed
//   it just after the act and no read of this build had seen it before
//   (`./act-places.ts`). Lane B round 10 (`run-mv5tusj4-b7ee0630`) removed the
//   dish soap the cart held before the build began, twice, unasked, under
//   `undoes` of two adds: the old allowance followed the act, not the item.
//   Once per act: an unasked removal that landed spends it, and a later claim
//   on that act is refused before anything runs (`candidate.undo_already_done`).
//   Any other removal is gated exactly as any call is, and asked.
// - **An undo refused is an act kept, at once (t475).** A control refused as
//   another item's, or an undo the gate refused, keeps the act: it is never
//   asked for again and every trial runs with it in place, saying so under
//   `startedWith.cannotUndo`. Lane D round 10 build 2 sent refused undos until
//   the repeat guard ended the build.
// - **Only an act whose effect appeared is recorded (t475).** An act whose own
//   page read the same just after it as just before (`noEffect`) left nothing
//   the site shows, and is not asked for: lane B round 10 was told to undo an
//   Add to cart that added nothing, and removed the soap instead.
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
// **A start hook's reset asks the model for nothing (t475, t479).** When the
// deployment's start hook has just put the site back (`startReset`), every act
// of this build, kept ones too, counts undone, nothing is compared, and the
// trial runs. The hook is the deployment's own reset of the whole site; what a
// look after it still sees is content that changes by itself, a cover the
// runtime closed during the act, or a gap in the hook -- never something the
// model can put back better. t475 looked again on each act's own page and
// asked for what it still saw: lane B round 11 (`run-mv5yaapd-ad19eaae`) was
// asked to undo a rotating carousel and a chat card's cover, and that ask is
// what drove the removal of the dish soap.
//
// A phase runs from the build's start, or from one trial to the next. The
// policy before a trial (`./trial-policy.ts`) reads it.

import type { AutomationStudioActionConsequence, AutomationStudioActionEffect } from "../../action-permissions/index.ts";
import type {
  AutomationStudioSiteResetBeforeTrialOptions,
  AutomationStudioSiteResetCalls,
  AutomationStudioSiteResetChecks,
  AutomationStudioSiteResetClaim,
  AutomationStudioSiteResetComparison,
  AutomationStudioSiteResetDecision,
  AutomationStudioSiteResetExplored,
  AutomationStudioSiteResetNamedAct,
  AutomationStudioSiteResetPlace,
  AutomationStudioSiteResetSpot,
  AutomationStudioSiteResetTarget,
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
  undoable: boolean;
  undone: boolean;
  /** The call that last tried to undo it, as the model gave its id. */
  undoneBy?: string;
  /** Undo calls of it that landed. */
  attempts: number;
  /** Whether a landed undo changed the page it ran on and stayed there: unknown when no read was made. */
  undoChanged?: boolean;
  /** An unasked removal of what it created landed: spent. */
  spent: boolean;
  /** Its own page before it, and what it changed there. */
  place?: AutomationStudioSiteResetPlace;
  /** Where the control it acted on sat; absent when that is not known (a trial's act). */
  spot?: AutomationStudioSiteResetSpot;
  /** The items it created, as its own page showed them (t475). */
  createdItems: string[];
  /** In this phase an undo of it landed on its own item (`own`) or on one it created (`created`): a dialog that follows may confirm it. */
  chain?: "own" | "created" | undefined;
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
    if (act?.kept && !act.undone && act.undoable) return { kind: "refused", evidence: { ok: false, code: "candidate.undo_act_kept", act: act.id, instruction: WORDS.keptAct(), actsToUndo: this.inPlace() } };
    if (!act || !this.toUndo(act)) {
      const actsToUndo = this.inPlace();
      return { kind: "refused", evidence: { ok: false, code: "candidate.undo_unknown_act", instruction: WORDS.unknownAct(actsToUndo.length > 0), actsToUndo } };
    }
    if (act.spent) {
      // Acts an undo already landed on are checked before the trial; the model is pointed only at those nobody has tried.
      const actsToUndo = this.acts.filter((entry) => this.toUndo(entry) && entry !== act && !(entry.attempts > 0 && entry.undoChanged !== false)).map(namedAct);
      return { kind: "refused", evidence: { ok: false, code: "candidate.undo_already_done", act: act.id, ...(act.undoneBy ? { undoneBy: act.undoneBy } : {}), instruction: WORDS.alreadyUndone(actsToUndo.length > 0), actsToUndo } };
    }
    // What the undo may do unasked is decided per control, before it is acted on (`target`).
    return { kind: "undo", undo: { act: act.id, allowed: [] } };
  }

  /**
   * Whether an undo of `actId` may act on the control the domain declared,
   * read before it acts (header). A refusal keeps the act: it is never asked
   * for again, and the control is not acted on.
   */
  target(actId: string, declared: { effect: AutomationStudioActionEffect; consequences: readonly AutomationStudioActionConsequence[]; control: AutomationStudioSiteResetSpot }): AutomationStudioSiteResetTarget {
    const act = this.acts.find((entry) => entry.id === actId);
    if (!act || !this.toUndo(act)) {
      const actsToUndo = this.inPlace();
      return { kind: "refused", evidence: { ok: false, code: "candidate.undo_unknown_act", instruction: WORDS.unknownAct(actsToUndo.length > 0), actsToUndo } };
    }
    // A look changes nothing, wherever it looks.
    if (declared.effect === "observe") return { kind: "admit", on: "moving", allowed: [] };
    const { item, dialog } = declared.control;
    if (item !== undefined && act.createdItems.includes(item)) return { kind: "admit", on: "created", allowed: act.spent ? [] : ["delete"] };
    if (act.spot && sameItem(act.spot, declared.control)) return { kind: "admit", on: "own", allowed: [] };
    if (item === undefined && dialog !== undefined && act.chain) return { kind: "admit", on: "follow_up", allowed: act.chain === "created" && !act.spent ? ["delete"] : [] };
    if (item === undefined && dialog === undefined && declared.consequences.length === 0) return { kind: "admit", on: "moving", allowed: [] };
    act.kept = true;
    return { kind: "refused", evidence: { ok: false, code: "candidate.undo_wrong_target", act: act.id, instruction: WORDS.wrongTarget(), cannotUndo: [namedAct(act)] } };
  }

  explored(call: AutomationStudioSiteResetExplored): void {
    const declared = call.declared;
    if (call.undoes !== undefined) {
      const act = this.acts.find((entry) => entry.id === call.undoes);
      if (!act || !this.toUndo(act)) return;
      // An undo the gate refused is not tried again: the act stays, and the trial runs with it (t475).
      if (declared && declared.effect === "mutate" && !declared.permitted) {
        act.kept = true;
        return;
      }
      // Only a call that acted on the site is an attempt: a look leaves the act as it was.
      if (!call.landed || act.spent || !declared?.permitted || declared.effect !== "mutate") return;
      act.attempts += 1;
      act.undoneBy = call.callId;
      const unasked = call.on === "created" || (call.on === "follow_up" && act.chain === "created");
      if (unasked && declared.consequences.includes("delete")) act.spent = true;
      if (call.on === "own" || call.on === "created") act.chain = call.on;
      // The site's one confirmation of that undo is given: no further lasting dialog press follows from it (header, t479).
      else if (call.on === "follow_up" && declared.consequences.some((consequence) => UNDOABLE.has(consequence) || IRREVERSIBLE.has(consequence))) act.chain = undefined;
      return;
    }
    if (!call.landed || !declared?.permitted || declared.effect !== "mutate") return;
    const words = [declared.verb, declared.control.name === null ? "" : JSON.stringify(declared.control.name), declared.control.kind ?? ""];
    const spot: AutomationStudioSiteResetSpot = {
      ...(declared.control.item !== undefined ? { item: declared.control.item } : {}),
      ...(declared.control.dialog !== undefined ? { dialog: declared.control.dialog } : {})
    };
    this.record(words.filter((word) => word.trim()).join(" ").trim(), call.callId, declared.consequences, call.callId, spot);
  }

  /** The act the exploration call `callId` made, if it made one. */
  actOf(callId: string): string | undefined {
    return [...this.acts].reverse().find((act) => act.call === callId)?.id;
  }

  /** Where `act` was made: its page before it, what it changed there, and the items it created. Nothing changed there, nothing to look for. */
  placed(act: string, place: AutomationStudioSiteResetPlace): void {
    const entry = this.acts.find((candidate) => candidate.id === act);
    if (!entry) return;
    if (place.created?.length) entry.createdItems = [...new Set([...entry.createdItems, ...place.created])];
    if (place.changed.length > 0) {
      entry.place = { state: structuredClone(place.state), location: place.location, changed: [...place.changed], ...(place.lines ? { lines: { gone: [...place.lines.gone], added: [...place.lines.added] } } : {}) };
    }
  }

  /**
   * `act`'s own page read the same just after it as just before (t475): its
   * effect never appeared, so there is nothing of it to undo. It is not asked
   * for, and no undo may name it.
   */
  noEffect(act: string): void {
    const entry = this.acts.find((candidate) => candidate.id === act);
    if (entry && entry.attempts === 0) entry.undoable = false;
  }

  /** What an undo of `act` did to the page it ran on: whether it changed that page and stayed on it. */
  undoSeen(act: string, changedInPlace: boolean): void {
    const entry = this.acts.find((candidate) => candidate.id === act);
    if (entry) entry.undoChanged = (entry.undoChanged ?? false) || changedInPlace;
  }

  /**
   * The reset before a trial: acts named under `cannotUndo` kept, every act
   * still to undo looked for on its own page, then the policy applied to this
   * phase. `checks.compare` is asked only when it is needed, and once. After a
   * start hook (`startReset`), every act counts undone and the trial runs, with
   * nothing compared or asked (header, t479).
   */
  async beforeTrial(checks: AutomationStudioSiteResetChecks | AutomationStudioSiteResetChecks["compare"], cannotUndo?: readonly string[], options: AutomationStudioSiteResetBeforeTrialOptions = {}): Promise<AutomationStudioSiteResetDecision> {
    const asked: AutomationStudioSiteResetChecks = typeof checks === "function" ? { compare: checks } : checks;
    let start: Promise<AutomationStudioSiteResetComparison> | undefined;
    const compare = (): Promise<AutomationStudioSiteResetComparison> => (start ??= asked.compare());
    for (const act of this.acts) act.chain = undefined;
    for (const id of cannotUndo ?? []) {
      const act = this.acts.find((entry) => entry.id === id);
      // Only an act the reset has already asked for: the model has seen it listed, and had the chance to try.
      if (act && this.toUndo(act) && act.askedFor > 0) act.kept = true;
    }
    if (options.startReset === true) {
      // The hook put the whole site back: no act of this build is on it, and the model is asked for nothing (header).
      for (const act of this.acts) {
        if (!act.undoable || act.undone) continue;
        act.undone = true;
        delete act.stillThere;
      }
      this.phase = { recorded: 0, refusals: 0, startDiffersSent: false };
      return { kind: "admit" };
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
    const answer = await automationStudioSiteResetTrialPolicy({ phase: { ...this.phase }, inPlace: this.inPlace(), kept, compare });
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
    for (const act of this.acts) act.chain = undefined;
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

  private record(did: string, ref: string, consequences: readonly AutomationStudioActionConsequence[], call?: string, spot?: AutomationStudioSiteResetSpot): void {
    const lasting = consequences.some((consequence) => UNDOABLE.has(consequence) || IRREVERSIBLE.has(consequence));
    if (!lasting || this.next > MAX_ACT) return;
    const undoable = !consequences.some((consequence) => IRREVERSIBLE.has(consequence));
    this.acts.push({ id: `act-${this.next}`, did: did || "an act", ref, ...(call ? { call } : {}), ...(spot ? { spot } : {}), createdItems: [], undoable, undone: false, attempts: 0, spent: false, askedFor: 0, kept: false });
    this.next += 1;
    this.phase = { ...this.phase, recorded: this.phase.recorded + 1 };
  }
}

/**
 * Whether `control` sits on the item `spot` names, by a positive match (header,
 * t479): both item tokens present and equal, in the same dialog or in none. A
 * token missing on either side is never a match.
 */
function sameItem(spot: AutomationStudioSiteResetSpot, control: AutomationStudioSiteResetSpot): boolean {
  if (spot.item === undefined || control.item === undefined || spot.item !== control.item) return false;
  return (spot.dialog ?? null) === (control.dialog ?? null);
}

/** An act as the model is shown it. */
function namedAct(act: Act): AutomationStudioSiteResetNamedAct {
  return { act: act.id, did: act.did, ...(act.call ? { call: act.call } : {}), ...(act.stillThere?.length ? { stillThere: [...act.stillThere] } : {}) };
}
