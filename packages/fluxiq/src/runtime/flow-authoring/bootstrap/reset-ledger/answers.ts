// The site-reset ledger's settlement answers: which of this build's acts are
// still to undo, which no call can settle, which are possibly lasting, and
// whether one act is left. Moved whole out of `../site-reset/ledger.ts` (t797, no change in
// behaviour) with these header paragraphs; the ledger is a facade over this,
// `./recording.ts` and `./claims.ts`.
//
// **One settlement model for every strict act (L1, 2026-10-19).** An act is
// settled by fresh complete reads of everything it could change -- its list
// groups and its own control's toggle -- `restored` when a change was seen or
// an undo landed, otherwise `unchanged`, sticky and told to every later
// trial's judge. The judgement -- the witnesses, the destinations a trial act
// repeats and the witnesses its plan step's stamp carries,
// Core's own look at each stale witness's place before a trial, lists that
// look cannot read again, and the words an open act says under `settle` --
// lives in `../reset-settlement/judge.ts`, with its header; this ledger hands
// it its acts, reads and receipts.
//
// **No call can settle it: `gate_unsatisfiable` (t743, rerun round 4).** An
// open act whose every reason no call can meet -- its only witnesses lists
// Core cannot read again (photo `run-mvgw7320-de416190`), or nothing to name
// once refs are closed (office `run-mvgvyaip-d856e135`) -- leaves the acts to
// undo (`inPlace`) and is listed apart under `actsUnsettleable`, with the
// closed condition it failed, wherever `actsToUndo` is answered
// (`unsatisfiable`). It never refuses a trial (t775): it is said under
// `startedWith.acts` and `siteChange.leftFromEarlier`. An act that settles with a
// list Core could not read again is told to every later trial's judge as such
// (`unread`), under `startedWith.cannotUndo` as an unchanged act is. A third
// case (t748, t743 open item 2): an act whose differing lists no undo could
// ever put back, or whose own control answered a state it cannot be pressed
// back from, fails `no_admissible_undo` (`../reset-undo/reach.ts`) -- never on a list
// read in place after an undo landed, which says nothing yet (t772 R1,
// `../reset-settlement/observations.ts`).
//
// **Every act to undo has a call it is told that is admitted (t797 P4 item
// 4).** An act stays among the acts to undo only while some reason it is still
// open is one a call its `settle` words name can meet, and the undo admission
// admits that call: a look, a reload, a list to name, an undo where a list
// differs, its own control pressed back from the state it set, or its value set
// back by its own control. Otherwise it is listed apart with what it did, the
// call that made it and the closed condition it failed, and a trial still runs
// with it said as possibly left: among them an act whose own control a fresh
// read shows in a third state or no longer at its place (`control_other`,
// `no_admissible_undo`, `../reset-settlement/judge.ts`), so no answer asks for a
// press back every admission refuses. Swept over ledger states in
// `../site-reset/tests/ledger-act-to-call.test.ts`. This verdict is the one
// every refusal of an undo of that act follows (`../reset-answers/agreeing.ts`).
//
// **What is left agrees with settlement (t772 w7).** Whether an act is left --
// `no` when settled (`restored`, or `unchanged`: never said to be left), `yes`
// while open, `possibly` once closed as one no call can settle (with what it
// failed), kept or possibly lasting -- is decided by one function
// (`./leftover.ts`, `leftOf`) that the acts to undo, the acts listed apart,
// `standing`, `leftover`, a project snapshot and a trial's acts left all read.

import type { AutomationStudioSiteResetSettlementJudge } from "../reset-settlement/index.ts";
import type { AutomationStudioSiteResetNamedAct, AutomationStudioSiteResetUnsettleableAct } from "../site-reset/index.ts";
import type { AutomationStudioSiteResetLedgerAct as Act } from "./act.ts";
import { AUTOMATION_STUDIO_SITE_RESET_IRREVERSIBLE_CLASSES as IRREVERSIBLE } from "./lasting-classes.ts";
import { automationStudioSiteResetLeftover as leftoverOf, type AutomationStudioSiteResetLeftover } from "./leftover.ts";
import { automationStudioSiteResetLedgerNamedAct as namedAct } from "./named-act.ts";
import type { AutomationStudioSiteResetLedgerState } from "./state.ts";
import { automationStudioSiteResetUndoReach as undoReach } from "../reset-undo/index.ts";

/** The ledger's settlement answers over its shared state (header). */
export class AutomationStudioSiteResetLedgerAnswers {
  /** The ledger as `../reset-undo/reach.ts` reads it: whether any undo could still put back what an open act's lists show (header, t748). */
  private readonly reachable: Parameters<typeof undoReach>[0];

  constructor(private readonly state: AutomationStudioSiteResetLedgerState) {
    this.reachable = { acts: state.acts, seen: state.seen, clock: () => state.clock, claimable: (act) => this.claimable(act), lent: (act) => state.judge.lent(act), toggle: (act) => state.judge.toggleOf(act), differing: (act) => state.judge.differing(act), described: (scope) => state.createBaselines.described(scope) };
  }

  /** This build's acts still to undo, as the model is shown them; an open strict act says under `settle` what settles it (header, L1). */
  inPlace(): AutomationStudioSiteResetNamedAct[] {
    return this.state.acts.filter((act) => this.leftOf(act).standing === "in_place").map((act) => this.named(act));
  }

  /** This build's acts no call can settle (`gate_unsatisfiable`, header, t743), each with the closed condition it failed; never among `inPlace`. */
  unsatisfiable(): AutomationStudioSiteResetUnsettleableAct[] {
    return this.state.acts.flatMap((act) => {
      const left = this.leftOf(act);
      return left.standing === "unsettleable" ? [{ act: act.id, did: act.did, ...(act.call ? { call: act.call } : {}), reason: "gate_unsatisfiable" as const, failed: left.failed }] : [];
    });
  }

  /** This build's possibly lasting acts that may still be on the site (`./recording.ts`, t593): never asked for, each marked `possible`. */
  possiblyInPlace(): AutomationStudioSiteResetNamedAct[] {
    return this.state.acts.filter((act) => this.leftOf(act).standing === "possible").map(namedAct);
  }

  /** Whether one act is left on the site, as its settlement answers it (header, t772 w7, `./leftover.ts`); undefined for an id this ledger never gave. */
  leftover(actId: string): AutomationStudioSiteResetLeftover | undefined {
    const act = this.state.acts.find((entry) => entry.id === actId);
    return act ? this.leftOf(act) : undefined;
  }

  /** The lists named for a settled act that Core could not read again (t743, t783), for words said about it: the same ones its `startedWith` words name; undefined where none, or for an id this ledger never gave. */
  unreadOf(actId: string): readonly string[] | undefined {
    return this.state.acts.find((entry) => entry.id === actId)?.unread;
  }

  /** Whether any read after the act ever showed a change it made, for words said about it (t738); undefined for an id this ledger never gave. */
  changeSeen(actId: string): boolean | undefined {
    return this.state.acts.find((entry) => entry.id === actId)?.changeSeen;
  }

  /** Still on the site, and still the model's to undo: never one no call can settle (header, t743). */
  toUndo(act: Act): boolean {
    return this.leftOf(act).standing === "in_place";
  }

  /** Whether `act` is left, settled first where it can be: the one answer every leftover and settlement answer reads (header, t772 w7). */
  leftOf(act: Act): AutomationStudioSiteResetLeftover {
    this.settledNow(act);
    return leftoverOf(act, act.consequences.some((consequence) => IRREVERSIBLE.has(consequence)), () => this.unmet(act));
  }

  /** The closed condition an open strict act fails where no call can settle it (header, t743, t748); none otherwise. */
  unmet(act: Act): ReturnType<AutomationStudioSiteResetSettlementJudge["unmet"]> {
    return this.open(act) && this.claimable(act) ? this.state.judge.unmet(act, undoReach(this.reachable, act)) : undefined;
  }

  /** A strict act that may still settle (header, L1). */
  open(act: Act): boolean {
    return act.strictReset && act.undoable && !act.undone && !act.possible && act.settled === undefined;
  }

  /** Settled for good, judged now where it is still open (header, L1); `restored` marks it undone, and lists Core could not read again are kept for the judge (t743). */
  settledNow(act: Act): "restored" | "unchanged" | undefined {
    if (act.settled || !this.open(act)) return act.settled;
    const decision = this.state.judge.evaluate(act);
    if (decision.kind !== "settled") return undefined;
    act.settled = decision.how;
    if (decision.unread) act.unread = [...decision.unread];
    if (decision.how === "restored") act.undone = true;
    return decision.how;
  }

  /** An act as the model is shown it: an open strict act with what settles it (header, L1). */
  named(act: Act): AutomationStudioSiteResetNamedAct {
    const said = namedAct(act);
    const settle = this.open(act) ? this.state.judge.settle(act) : undefined;
    return settle ? { ...said, settle } : said;
  }

  /** Still on the site, and an undo may name it: a possibly lasting act too, though it is never asked for (`./recording.ts`, t593). An act settled unchanged is left. */
  claimable(act: Act): boolean {
    return act.undoable && !act.undone && (!act.kept || act.strictReset) && act.settled !== "unchanged";
  }
}
