// How the site-reset ledger records the calls and trials that reach it:
// exploration calls (`explored`) and their places (`placed`, `noEffect`,
// `undoSeen`), a trial's own acts (`trialRan`), and where each act's effect may
// show (`locate`). Moved whole out of `../site-reset/ledger.ts` (t797, no change in
// behaviour) with these header paragraphs; the ledger is a facade over this,
// `./answers.ts` and `./claims.ts`.
//
// Candidate mode had no record of what a build left on the site. So the build's
// permission wrapper (`../action-permissions.ts`) tells this ledger every
// exploration call it ran (`explored`), and the trial gate tells it each trial's
// own lasting acts (`trialRan`). Each becomes an act `act-N`, numbered once and
// never reused, which the model names under `undoes` on the `core.run_node` call
// that reverses it (`./claims.ts`, `claim`).
//
// - An act is recorded only when it landed, was permitted, applied an effect
//   ("mutate") and declared a lasting class: `create_new`, `modify_existing` or
//   `delete`. One declaring `move_money` or `send_or_publish` cannot be undone
//   through the site, so it is recorded as such and never asked for.
// - **An unchanged source proves no destination absence.** Legacy unscoped
//   acts retain the noEffect policy (t475); strict acts settle only by their
//   witnesses (`./answers.ts`, L1).
//
// **A press with an effect but no lasting class is possibly lasting (t593).**
// A press that declares `none` can still leave something on the site: on A8
// crossborder `run-mv8c76i3-61b9ca89` a coupon press declared nothing, the
// coupon stayed collected for every later phase, and the build's ending said
// nothing of it was left. So where a ledger is asked to (`possible`, which a
// project build's ledgers are, `../site-reset/project-ledger.ts`), a landed, permitted
// `mutate` on a named control that declared no lasting class is recorded too,
// marked `possible`, and so is a trial step that declared none and changed its
// own page in place (`possible` on the trial act,
// `../../service/candidate-trial/landed-acts.ts`). Nothing is refused for it: it
// is never asked for, never refuses a trial and is never kept; a start hook
// takes it back without naming it among the acts it took back (a list of every
// control that declared `none` would be noise beside every trial); the model
// may still undo it under `undoes`, judged as any other undo; and while it may
// still be there it is answered under `possiblyInPlace`, so a phase's start can
// say so (`../../service/project-build/phase-start.ts`). A navigation names no
// control and is never one.
//
// **A trial's act is tied to its own item too (t598).** A trial step's act
// carries where its control sat and the items its own page showed new, read off
// that step's state diff (`spot`, `created` on the trial act,
// `../../service/candidate-trial/landed-acts.ts`), and an undo of it is
// admitted on them exactly as on an explored act's. Where the diff gave
// neither, it is recorded without them. A start hook takes it back as before.
// A step that ran in several loop passes says its pass (t748): `trial step 6,
// pass 3 of 3 "<label>"`; one that ran once keeps `trial step N "<label>"`.
//
// **The seal is per group (t751 R1).** Each act counts its witness groups --
// its destinations, its own list, a transfer's, its subject undo's and those
// its repeats lend -- and a first read of a group it touched is never an
// original (`../site-reset/create-baselines.ts`, `touch`). Only a legacy unscoped act
// seals every group; since t775 a strict act with no witness at all (the
// exploration door admits one) seals nothing, so a list read after it still
// issues a ref a step can name. A destination named under `undoes` is kept only
// from a call that landed (`../reset-undo/claims.ts`).
//
// **A value witness (t772).** An act no list, toggle, transfer or subject
// witnesses is witnessed by the shown values its press replaced (`placed`,
// `trialRan`; `../reset-settlement/judge.ts`, `valued`). A choice made under
// `undoes` before its own control confirms the undo is a step, no attempt.
//
// **A press that reverses an open act is its undo, `undoes` or not (P4).** An
// exploration press is recorded when it lands, before anything shows what it
// did; once the read just after it does -- its own control's counts at its place
// (`pairPressed`), or the client's effect record with its place (`placed`, CC4)
// -- a press that reverses exactly one earlier open act's recorded effect is
// paired with that act (`../reset-undo/claims.ts`, `pairOf`): counted as that
// act's undo, as a press named under `undoes` is, and closed as an act of its
// own (`pairedWith`; not `undoable`, so it is never asked for, listed or left;
// not among `exploredActs`). Its id was given and its sink told when it landed,
// so a project's act list still names it, answered not left. A trial's act is
// never paired: only an exploration press can be the build's undo.

import type { AutomationStudioActionConsequence } from "../../action-permissions/index.ts";
import { automationStudioSiteResetWitnessStampValid as stampValid } from "../reset-admission/index.ts";
import {
  automationStudioSiteResetToggleWitness as toggleWitness,
  automationStudioSiteResetTransferWitness as transferWitness,
  automationStudioSiteResetTrialRepeats as repeats,
  type AutomationStudioSiteResetObservations
} from "../reset-settlement/index.ts";
import type {
  AutomationStudioSiteResetExplored,
  AutomationStudioSiteResetExploredAct,
  AutomationStudioSiteResetNamedAct,
  AutomationStudioSiteResetPlace,
  AutomationStudioSiteResetSpot,
  AutomationStudioSiteResetTrialAct
} from "../site-reset/index.ts";
import type { AutomationStudioSiteResetLedgerAct as Act } from "./act.ts";
import type { AutomationStudioSiteResetLedgerAnswers } from "./answers.ts";
import type { AutomationStudioSiteResetLedgerClaims } from "./claims.ts";
import { AUTOMATION_STUDIO_SITE_RESET_IRREVERSIBLE_CLASSES as IRREVERSIBLE, AUTOMATION_STUDIO_SITE_RESET_UNDOABLE_CLASSES as UNDOABLE } from "./lasting-classes.ts";
import type { AutomationStudioSiteResetLeftover } from "./leftover.ts";
import { automationStudioSiteResetLedgerNamedAct as namedAct } from "./named-act.ts";
import type { AutomationStudioSiteResetLedgerState } from "./state.ts";
import { automationStudioSiteResetTrialStamp as takeStamp } from "./trial-stamp.ts";

/** The highest act number `undoes` can name (`^act-[1-9][0-9]{0,3}$`); no build comes near it, and past it nothing more is recorded. */
const MAX_ACT = 9999;
/** Where an act stands when a trial returns it as left on the site (`./answers.ts`, t772 w7): open, closed unsettleable, or kept. */
const LEFT_BY_TRIAL: ReadonlySet<AutomationStudioSiteResetLeftover["standing"]> = new Set(["in_place", "unsettleable", "kept"]);
/** What a possibly lasting act's words end with (header, t593). */
const POSSIBLY_LASTING = "declared no lasting act, but had an effect: possibly lasting";

/** The ledger's recording of the calls and trials that reach it, over its shared state (header). */
export class AutomationStudioSiteResetLedgerRecording {
  constructor(
    private readonly state: AutomationStudioSiteResetLedgerState,
    private readonly answers: AutomationStudioSiteResetLedgerAnswers,
    private readonly claims: AutomationStudioSiteResetLedgerClaims,
    /** The ledger's own public answers, asked through the ledger (`../site-reset/ledger.ts`). */
    private readonly ports: { exploredActs: () => AutomationStudioSiteResetExploredAct[] }
  ) {}

  explored(call: AutomationStudioSiteResetExplored): void {
    const declared = call.declared;
    const note = this.state.pressNotes.taken(call);
    if (note) call.note = note;
    const pressed = call.landed && declared?.permitted === true && declared.effect === "mutate";
    // A call naming an act under `undoes`: an undo or a look, never an act of its own (`../reset-undo/claims.ts`).
    if (call.undoes !== undefined) {
      // A step toward a value act's undo (`../reset-undo/admission.ts`) is no attempt: it changed the page, so earlier reads are stale (header, t772).
      if (call.on === "step") return pressed ? this.pressedUnder(declared.control.place) : undefined;
      const undone = this.state.acts.find((entry) => entry.id === call.undoes);
      const attempts = undone?.attempts ?? 0;
      this.claims.ran({ ...call, undoes: call.undoes });
      // An unasked subject undo that landed is spent whatever class it declared: one on a destination the act named may declare `modify_existing` (`../reset-undo/admission.ts`, t743).
      if (undone && call.on === "subject" && undone.attempts > attempts) undone.spent = true;
      // A list named for it under `undoes` is one it could change (header, t751 R1).
      if (undone) this.locate(undone);
      return;
    }
    if (!pressed) return;
    const words = [declared.verb, declared.control.name === null ? "" : JSON.stringify(declared.control.name), declared.control.kind ?? ""];
    const spot = spotOf(declared.control) ?? {};
    // A press on a named control that declared nothing lasting is possibly lasting, where this ledger records those (header).
    const possible = this.state.options.possible === true && declared.control.name !== null;
    if (possible || declared.consequences.some((consequence) => UNDOABLE.has(consequence) || IRREVERSIBLE.has(consequence))) this.state.clock += 1;
    const act = this.record(words.filter((word) => word.trim()).join(" ").trim(), call.callId, declared.consequences, call.callId, spot, possible, [], declared.control.name ?? undefined, call.operation);
    if (!act) return;
    const destination = this.state.createBaselines.destination(declared, call.resetDestination);
    if (destination) act.destinations.push(destination);
    // Its own press, filled by the next read of its page: a toggle only for exactly `modify_existing` (`./answers.ts`, L1).
    const press = declared.control.place === undefined ? undefined : this.state.tracker.press(declared.control.place, this.state.clock);
    if (press && onlyModifies(declared.consequences)) act.press = press;
    // Kept for pairing whatever reversible class it declared, until the read after it says what it flipped (header, P4).
    if (press && act.undoable && !act.possible) act.pairPress = press;
    this.locate(act);
  }

  /**
   * The read after a press filled its counts (header, P4): a press whose own control flipped back exactly what an earlier open
   * act's own press set there is that act's undo. Asked by the ledger on every read, once the tracker has taken it.
   */
  pairPressed(): void {
    for (const act of this.state.acts) {
      const press = act.pairPress;
      if (!press?.after) continue;
      delete act.pairPress;
      const toggle = toggleWitness({ state: act.spot?.state, before: press.before, after: press.after });
      if (toggle) this.pair(act, { place: press.place, ...toggle });
    }
  }

  /** The act the exploration call `callId` made, if it made one. */
  actOf(callId: string): string | undefined {
    return [...this.state.acts].reverse().find((act) => act.call === callId)?.id;
  }

  /** This ledger's explored acts, each with every destination named for it so far (`./answers.ts`, L1). */
  exploredActs(): AutomationStudioSiteResetExploredAct[] {
    // A press paired as an earlier act's undo is no act of its own (header, P4).
    return this.state.acts.filter((act) => act.call !== undefined && act.pairedWith === undefined).map((act) => ({ id: act.id, consequences: act.consequences, ...(act.operation ? { operation: act.operation } : {}), ...(act.spot ? { spot: act.spot } : {}), destinations: [...act.destinations], witnessed: this.witnessGroups(act).length > 0 || this.state.judge.toggleOf(act) !== undefined }));
  }

  /** Where `act` was made: its page before it, what it changed there, and the items it created. Nothing changed there, nothing to look for. */
  placed(act: string, place: AutomationStudioSiteResetPlace): void {
    const entry = this.state.acts.find((candidate) => candidate.id === act);
    if (!entry) return;
    if (place.effect) entry.effect = structuredClone(place.effect);
    // A press paired as an earlier act's undo, by its counts or now by its effect record, is that act's undo seen on its page,
    // as one named under `undoes` is (`../site-reset/act-places.ts`), never a place of its own (header, P4).
    const paired = entry.pairedWith ?? (entry.call !== undefined && this.pair(entry) ? entry.pairedWith : undefined);
    if (paired !== undefined) {
      this.undoSeen(paired, place.changed.length > 0);
      return;
    }
    witnessTransfer(entry, place.collections, this.state.seen, this.state.acts.indexOf(entry) + 1);
    if (entry.transfer) this.locate(entry);
    if (place.created?.length) entry.createdItems = [...new Set([...entry.createdItems, ...place.created])];
    if (place.changed.length > 0) {
      entry.place = { state: structuredClone(place.state), location: place.location, changed: [...place.changed], ...(place.lines ? { lines: { gone: [...place.lines.gone], added: [...place.lines.added] } } : {}) };
    }
    // The shown values its press replaced witness it where nothing else does (header, t772).
    if (place.values && onlyModifies(entry.consequences)) this.state.judge.valued(entry, place.values, "read");
  }

  /** A landed press under `undoes` changed the site: the clock moves, and its place, if any, gets a press (`./answers.ts`, L1). */
  pressedUnder(place: string | undefined): void {
    this.state.clock += 1;
    if (place !== undefined) this.state.tracker.press(place, this.state.clock);
  }

  /**
   * An unchanged source suppresses only a legacy unscoped act (t475).
   * Identified effects require positive original-inventory restoration.
   */
  noEffect(act: string): void {
    const entry = this.state.acts.find((candidate) => candidate.id === act);
    // A paired press that left its page unchanged is its act's undo seen changing nothing there (header, P4).
    if (entry?.pairedWith !== undefined) {
      this.undoSeen(entry.pairedWith, false);
      return;
    }
    // An unchanged source says nothing about an effect in another collection.
    if (entry && !entry.strictReset && entry.attempts === 0) entry.undoable = false;
  }

  /** What an undo of `act` did to the page it ran on: whether it changed that page and stayed on it. */
  undoSeen(act: string, changedInPlace: boolean): void {
    const entry = this.state.acts.find((candidate) => candidate.id === act);
    if (entry) entry.undoChanged = (entry.undoChanged ?? false) || changedInPlace;
  }

  /** A trial ran: a new phase starts with what was still in place and the trial's own acts, which are answered as left on the site. */
  trialRan(acts: readonly AutomationStudioSiteResetTrialAct[], trialRunId?: string): AutomationStudioSiteResetNamedAct[] {
    this.state.recordedInPhase = 0;
    for (const act of this.state.acts) act.chain = undefined;
    // A trial changed the site: every read before it is stale (`./answers.ts`, L1).
    this.state.clock += 1;
    const explored = this.buildExplored();
    for (const act of acts) {
      const label = act.label ? JSON.stringify(act.label) : act.definitionId;
      // A looped step's pass is named, so its passes' acts read apart (header, t748).
      const did = `trial step ${act.step}${passWords(act.pass)} ${label}${act.control ? ` on ${JSON.stringify(act.control)}` : ""}`;
      // Where its step's control sat and what it made, as exploration records an act (header, t598).
      const recorded = this.record(did, `${trialRunId ?? "trial"}#step-${act.step}`, act.consequences, undefined, spotOf(act.spot), this.state.options.possible === true && act.possible === true, act.created, act.control, act.definitionId);
      const place = act.spot?.place;
      // Whether the build pressed this step's own item (its page) at that place before: then its diff's before is no original (t751 R1).
      const itemPressed = place !== undefined && act.controls !== undefined && this.state.tracker.pressedAt(act.controls.page, place);
      // Its step's press at its control's place, read on both sides by the step's own diff, with where its page is (L1, d7).
      const press = place !== undefined && act.controls ? this.state.tracker.landed(act.controls.page, place, act.controls.before, act.controls.after, this.state.clock, act.controls.location) : undefined;
      // A lasting act at a place its step read no controls at: a press there, so no later read seeds that place's start (t751 R1).
      if (place !== undefined && !act.controls && lastingClasses(act.consequences)) this.state.tracker.touched(place);
      if (!recorded) continue;
      // The project admitted this scoped witness before execution; an incomplete diff cannot downgrade it to legacy.
      if (this.state.options.owner !== undefined && stampValid(act.witness) && act.witness.via !== "legacy" && lastingClasses(act.consequences)) recorded.strictReset = true;
      witnessTransfer(recorded, act.collections, this.state.seen, this.state.acts.indexOf(recorded) + 1);
      if (press && onlyModifies(act.consequences)) recorded.press = press;
      // The explored acts it repeats lend it their destinations, named whenever (`./answers.ts`, L1).
      if (recorded.strictReset) recorded.repeats = explored.filter((other) => repeats({ consequences: act.consequences, definitionId: act.definitionId, spot: act.spot }, { consequences: other.consequences, operation: other.operation, spot: other.spot })).map((other) => other.id);
      takeStamp(recorded, act.witness, { createBaselines: this.state.createBaselines, controlWitnesses: this.state.controlWitnesses }, act.controls, itemPressed);
      // Its step's diff's replaced values witness it where nothing else does; an unread place starts at its from (header, t772).
      if (act.values && onlyModifies(act.consequences)) this.state.judge.valued(recorded, act.values, "diff");
      this.locate(recorded);
    }
    // Left or possibly left, as settlement answers it (`./answers.ts`, t772 w7); a possibly lasting act is answered under `possiblyInPlace` (header).
    return this.state.acts.filter((act) => LEFT_BY_TRIAL.has(this.answers.leftOf(act).standing)).map((act) => this.answers.named(act));
  }

  /**
   * Where an act's effect may show (header, t751 R1): its witness groups are touched, so no first read of them becomes an
   * original; a legacy unscoped act seals every group (a strict act with none seals nothing, t775). A possibly lasting act
   * does neither.
   */
  locate(act: Act): void {
    if (act.possible) return;
    const resources = [...new Set(act.destinations.map((destination) => this.state.createBaselines.resourceOf(destination.scope)).filter((resource): resource is string => resource !== undefined))];
    if (act.spot?.resource !== undefined || !resources.length) this.state.controlWitnesses.touchedAt(act.spot);
    else for (const resource of resources) this.state.controlWitnesses.touchedAt({ resource });
    // A strict act with no witness seals nothing (t775): originals serve only a targeted undo, and a list read after it must
    // still issue a ref a later step can name where its change shows. Only a legacy unscoped act seals every group.
    if (!act.strictReset) this.state.createBaselines.seal();
    else this.state.createBaselines.touch(this.witnessGroups(act));
  }

  /** The list groups an act counts among its witnesses (header, t751 R1): destinations, those its repeats lend, a transfer's, its subject undo's and its own list read before it. */
  witnessGroups(act: Act): string[] {
    const groups = [...act.destinations, ...this.state.judge.lent(act)].map((entry) => entry.group);
    if (act.transfer) groups.push(act.transfer.group);
    if (act.subjectUndo) groups.push(act.subjectUndo.group);
    const scope = act.spot?.scope;
    const own = scope === undefined ? undefined : this.state.seen.originals.get(scope);
    if (own && own.beforeAct < this.state.acts.indexOf(act) + 1) groups.push(own.group);
    const original = scope !== undefined && act.spot?.resource !== undefined ? this.state.createBaselines.known().original(scope, act.spot.resource) : undefined;
    if (original) groups.push(original.group);
    return [...new Set(groups)];
  }

  /** The build's explored acts, every brief's in a project build (`./answers.ts`, L1). */
  buildExplored(): readonly AutomationStudioSiteResetExploredAct[] {
    return this.state.options.buildExplored ? this.state.options.buildExplored() : this.ports.exploredActs();
  }

  /**
   * `by`, a press that named no act, paired with the one open act it reverses (header, P4; `./claims.ts`, `pairOf`): recorded
   * as that act's undo, so it is no act of its own -- never asked for, listed or left -- and its act's lists are touched as an
   * undo's are. Its press already moved the clock and its place, as a press under `undoes` does. Paired at the read just
   * after it, so the phase it was counted in is still this one.
   */
  private pair(by: Act, toggle?: { place: string; from: string; to: string }): boolean {
    const act = this.claims.pairOf(by, toggle);
    if (!act) return false;
    by.pairedWith = act.id;
    // Nothing of it is left: it put back what `act` did (`./leftover.ts`: no lasting class past `undoable`).
    by.undoable = false;
    delete by.press;
    delete by.pairPress;
    this.state.recordedInPhase = Math.max(0, this.state.recordedInPhase - 1);
    this.claims.paired(act, by);
    this.locate(act);
    return true;
  }

  private record(did: string, ref: string, consequences: readonly AutomationStudioActionConsequence[], call?: string, spot?: AutomationStudioSiteResetSpot, possible = false, created: readonly string[] = [], control?: string, operation?: string): Act | undefined {
    const lasting = consequences.some((consequence) => UNDOABLE.has(consequence) || IRREVERSIBLE.has(consequence));
    if (!lasting && !possible) return;
    const id = this.state.options.nextActId ? this.state.options.nextActId() : this.state.next <= MAX_ACT ? `act-${this.state.next}` : undefined;
    if (id === undefined) return;
    const undoable = !consequences.some((consequence) => IRREVERSIBLE.has(consequence));
    // Said as possibly lasting wherever it is named, since some answers carry only what an act did (header).
    const words = lasting ? did || "an act" : `${did || "an act"} (${POSSIBLY_LASTING})`;
    const act: Act = { id, did: words, ref, ...(call ? { call } : {}), ...(control?.trim() ? { control: control.trim() } : {}), ...(operation ? { operation } : {}), ...(spot ? { spot } : {}), createdItems: [...new Set(created)], destinations: [], repeats: [], clock: this.state.clock, changeSeen: false, strictReset: lasting && (spot?.subject !== undefined || spot?.page !== undefined || spot?.scope !== undefined), consequences: [...consequences], undoable, undone: false, attempts: 0, spent: false, askedFor: 0, kept: false, possible: !lasting };
    this.state.acts.push(act);
    this.state.next += 1;
    // A possibly lasting act never makes a comparison due (header).
    if (lasting) this.state.recordedInPhase += 1;
    this.state.options.sink?.({ ...namedAct(act), ...(this.state.options.owner !== undefined ? { owner: this.state.options.owner } : {}), ref, undoable });
    return act;
  }
}

/** `, pass K of N` for a well-formed pass of a step that ran more than once (header, t748); nothing otherwise. */
function passWords(pass: AutomationStudioSiteResetTrialAct["pass"]): string {
  return pass && Number.isSafeInteger(pass.number) && Number.isSafeInteger(pass.of) && pass.of > 1 && pass.number >= 1 && pass.number <= pass.of ? `, pass ${pass.number} of ${pass.of}` : "";
}

/** Freeze only a pure, unambiguous immediate transition (`../reset-settlement/transfer-witness.ts`); no later current observation establishes ownership. `sequence`: the act's 1-based place among its ledger's acts. */
function witnessTransfer(act: Act, witness: AutomationStudioSiteResetPlace["collections"], seen: AutomationStudioSiteResetObservations, sequence: number): void {
  if (act.transfer) return;
  const transfer = transferWitness({ consequences: act.consequences, spot: act.spot, witness, originals: seen.originals, sequence });
  if (transfer) act.transfer = transfer;
}

/** A spot's tokens, copied, or none when it named none of them. */
function spotOf(spot: AutomationStudioSiteResetSpot | undefined): AutomationStudioSiteResetSpot | undefined {
  const copied: AutomationStudioSiteResetSpot = {};
  for (const key of ["item", "dialog", "subject", "page", "scope", "resource", "place", "state"] as const) if (spot?.[key] !== undefined) copied[key] = spot[key];
  return Object.keys(copied).length > 0 ? copied : undefined;
}

/** Whether any class declared is lasting: one the site's controls can reverse, or one none takes back. */
function lastingClasses(consequences: readonly AutomationStudioActionConsequence[]): boolean {
  return consequences.some((consequence) => UNDOABLE.has(consequence) || IRREVERSIBLE.has(consequence));
}

/** Whether an act declared exactly `modify_existing`: the only act a toggle witnesses (`./answers.ts`, L1). */
function onlyModifies(consequences: readonly AutomationStudioActionConsequence[]): boolean {
  return consequences.length === 1 && consequences[0] === "modify_existing";
}
