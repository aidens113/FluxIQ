// The one act record of an attempt (plan D6; the rule is the user's: a lasting act
// is never repeated, and retrying never means repeating one).
//
// Four records hold acts today and none is shared (`./mergers/`). This one is carried
// across every round of an attempt and persisted, so a fresh round, a change of
// approach and the first real run after the attempt all see what already happened.
//
// **What it refuses (`admit`).** A call that is the same act as one a call declared:
//
//   landed            refused as done, no dispatch.
//   may_have_landed   refused until an observation ran after a refusal (`looked`, below):
//                     the retry is then not blind. Its state stays until a call settles it.
//   anything else     runs.
//
// The repeat is refused whatever the repeat itself declared: a model told an act is done
// must not get it through by declaring nothing the second time.
//
// **A task that asks for an act several times** ("add three of this") has that many landings
// of the identical act, and the next is refused. How many comes from the person's request
// alone (`asked`, `../asked-count/`), read once at the act's first landing and kept, as loop
// detection reads `askedRepeats`, so the two agree and nothing a model says later raises it. A
// call about a row is one per row whatever is asked: a count there is another row's business.
// A landing that may have happened counts as may have: it holds the act to a look first, and
// only a landing the answer says happened uses up the count.
//
// **The disclosed limit (D6).** A press that declared nothing cannot be told from one
// that only opens a page. It is recorded `may_have_landed`, marked `undeclared`, shown to
// the model and the judge, and left out of a result's acts and out of every refusal. A
// repeat that looks different to the code is possible too: identity across stages is
// `./identity/target-keys.ts`'s best reading, and the Lab's double-act oracle is what
// catches the rest.
//
// **The same act, on rows.** As the engine reads it
// (`engine/automation/lifecycle-run/act-identity.ts`), a per-row act is the same act only
// on the same row. So a call carrying a row meets a row-less act only through a handle,
// which names one control, and a call with no row meets any act of the same target.
// On one row, two acts are the same unless their controls' words differ: pressing
// a row's control by hand and in a loop ran under different selectors, and that must not
// read as two acts, while a row's two different controls must.
//
// **One row, several shapes.** A row reaches this record as a by-hand read holds it, as a
// walker's pass carries it, and as a Flow's For Each hands it on after a record output
// reshaped it. A digest of its fields differs across those, so every check about a row
// reads both: the digest, and the row's values against the acted row's
// (`./row-ties.ts`, `sameAs`). A row that fits several held rows is done if any of them is
// an acted one: it may be that row, and a row wrongly held not done is an act done twice. A by-hand
// press by a handle a read printed is on the row as that read held it, so it is read the same way:
// a run's For Each may have pressed that row in the shape its record output left it (t870).
//
// **Begun before it is sent (`begun`).** A lasting call goes on the record as
// `may_have_landed`, and that write is awaited, before anything is dispatched, so a process
// that dies mid-press leaves the act held to a look and never reports it landed. What the
// answer then says replaces that: `settled` first puts the record back as it stood and then
// reads the answer as if the call had only just been made, so an act's id, rows and count
// come out exactly as they would without it. A write that fails sends nothing.
//
// **A look lifts a hold only after a refusal (t870).** A round looks at the page before its
// model decides anything, and a carried-on attempt starts with such a look too, so counting those
// let a careless press through on a page that said it had landed. So the first press after an act
// became may-have-landed is always refused, whatever looks came before, and that refusal tells the
// model; only a look after it opens the act (`admit`, `looked`). This costs a press and a look
// more, only for an act in doubt. After that, whether to press is the model's reading of the page:
// Core does not read what a look shows. A forward run leaves a held row out whatever was looked at.
//
// Who was refused is kept in memory, on purpose. A restart between the refusal and the look loses
// it, so the next model is refused once more, never let through: it has seen no refusal itself, and
// its carried-on round's opening look must not open the act for it.
//
// **Before it is sent (`foreseen`, t870).** A by-hand press by a handle says nothing the record can
// know it by, so the domain says what it would be, and this is read beside the call's own identity.
// It only adds to what is refused, in the order an answer's own ties are read:
//
//   words that fit a row   the same act on that row, by its values in any shape, unless the
//                          controls' words differ: what `actedOn` ties after an answer.
//   the row's own page     the same, only where its key or control's words also agree.
//   on no row              the frozen form's keys: an act on no row by its address or whole
//                          fingerprint, an act on a row by its address alone. A row's control
//                          has the same fingerprint on every row, so that says nothing here.
//
// Neither form counts across pages: the same control on another page is another act ("Save" on
// two items), when both pages are known. Where one is not, it is held the same, as above. An act
// that was begun and never answered is known by the frozen form too, and by the words' row.
//
// **Rows nobody can tell apart (t870).** A press whose row fits several is refused while it may be
// the one done, since doing it twice is what nobody can take back, and it says so (`rowsUnclear`):
// the plain "already done" would be untrue of a row that may never have been pressed. One thing lets
// it go, the act's own answer: where the sentence naming what it acted on (`actedOnWords`) fits one
// row, now that a read has told them apart, and the press is on another row known to be another.
// Nothing else says which. How many landings against how many rows fit says how many are left, not
// which, so it would press one of them twice as easily as not. A frozen address could differ only
// because the press changed the control. So a row a run acted on in a shape that fits two, whose
// answer named no item, stays held on both, and the loop ladder asks the person. A press by a call
// that has the act's own key stays refused whatever the words say: one control is one control.
//
// **Rows left out (`rowsHeldDone`).** How many rows this attempt left out because they were held done
// (`./rows-left-out.ts`). In memory, as it says what this attempt did.
//
// **A count across a real run (`carried`, `counted`).** A run that settles into this record
// compares each pass with what it did itself, so a person's "add 3" must still press three
// times: it may pass while the count has room. A run that only carries acts from an attempt
// before it reads no count, as it never did: what was done is not done again.

import { type AutomationStudioAttemptAct, type AutomationStudioAttemptActClass, readAttemptActClasses } from "@fluxiq/contracts/automation";
import type { JsonObject } from "../../../core/index.ts";
import type {
  AutomationStudioAttemptActAdmission,
  AutomationStudioAttemptActBegun,
  AutomationStudioAttemptActCall,
  AutomationStudioAttemptActEntry,
  AutomationStudioAttemptActOutcome,
  AutomationStudioAttemptActPlaceNote,
  AutomationStudioAttemptActRecordData
} from "./contracts.ts";
import { automationStudioAttemptActId, automationStudioAttemptActRowIdentity, automationStudioAttemptActTargetKeys, type AutomationStudioAttemptActTargetKeys } from "./identity/index.ts";
import { parseAutomationStudioAttemptActRecordData } from "./record-data.ts";
import { AutomationStudioAttemptActRowTies as RowTies } from "./row-ties.ts";
import { AutomationStudioAttemptActRowsLeftOut as RowsLeftOut } from "./rows-left-out.ts";
import { automationStudioAttemptActScreenedWords } from "./words.ts";

/** What a fresh round is told about the record, in words that teach nothing about any site. */
const MODEL_RULE = "These acts already happened in this task or may have. Never repeat one: count what landed as done and carry on with what is left. Look at the page for one that may have landed: if its effect is there, it is done. A first try at it again is refused and says to look, and only a look after that lets it go.";

/** `rows` are what an act made by this call is on; `sameRows` adds every acted row it is in another shape. */
type Identity = AutomationStudioAttemptActTargetKeys & { actionId: string; rows: string[]; sameRows: string[] };
type ForRun = { actionId: string; parameters: JsonObject; row?: JsonObject | undefined; steps?: readonly string[] | undefined; counted?: boolean };
/** A lasting call on the record and not yet answered: its entry, and what that entry was before, where it was there. */
type Begun = { entry: AutomationStudioAttemptActEntry; before?: AutomationStudioAttemptActEntry };
/** What a call's `foreseen` says, read: the frozen form's keys, the rows its words fit (`named`, as found, and `namedSame`, in every shape acted on), and those of the page in hand. */
type Foreseen = { actionId: string; frozen: AutomationStudioAttemptActTargetKeys | undefined; named: string[]; namedSame: ReadonlySet<string>; onPage: ReadonlySet<string> };

export class AutomationStudioAttemptActRecord {
  private readonly entries: AutomationStudioAttemptActEntry[];
  private readonly ties: RowTies;
  private place: AutomationStudioAttemptActRecordData["place"];
  private readonly persist: ((data: AutomationStudioAttemptActRecordData) => Promise<void>) | undefined;
  private readonly now: () => number;
  private writing: Promise<void> = Promise.resolve();
  private failure: { error: unknown } | undefined;
  private readonly asked: ((call: AutomationStudioAttemptActCall) => number | undefined) | undefined;
  /** Keyed by the call itself: only the answer to that call may replace what it began. */
  private readonly open = new Map<AutomationStudioAttemptActCall, Begun>();
  /** The act a run's step last settled as landed, by the step's name, for `doubted`. In memory only: it is about the run under way. */
  private readonly landedBySteps = new Map<string, AutomationStudioAttemptActEntry>();
  /** Acts a call was refused for since they became may-have-landed, the only ones a look opens. In memory only (header). */
  private readonly refusedFor = new Set<AutomationStudioAttemptActEntry>();
  /** Rows left out as held done, for `rowsHeldDone`, and which rows a read returned twice, for the words of a refusal. In memory only (header). */
  private readonly leftOut = new RowsLeftOut();

  constructor(options: { seed?: AutomationStudioAttemptActRecordData; persist?: (data: AutomationStudioAttemptActRecordData) => Promise<void>; now?: () => number; asked?: (call: AutomationStudioAttemptActCall) => number | undefined } = {}) {
    const seed = options.seed === undefined ? undefined : parseAutomationStudioAttemptActRecordData(options.seed);
    if (seed && !seed.ok) throw new TypeError(`An act record's seed was not readable: ${seed.issues.join(", ")}.`);
    this.entries = seed?.ok ? seed.data.acts : [];
    this.ties = new RowTies(seed?.ok ? seed.data.rows : []);
    this.place = seed?.ok ? seed.data.place : undefined;
    this.persist = options.persist;
    this.now = options.now ?? Date.now;
    this.asked = options.asked;
  }

  /** Whether this call may be dispatched (header). `look_first` is the refusal itself: the caller says it and sends nothing, and only then does a look open the act. */
  admit(call: AutomationStudioAttemptActCall): AutomationStudioAttemptActAdmission {
    const identity = this.identityOf(call.actionId, call.parameters, call.row);
    const matching = this.sameActs(call, identity).filter((entry) => !entry.undeclared);
    const landed = matching.find((entry) => entry.state === "landed" && !hasRoom(entry, identity));
    if (landed) {
      this.leftOut.refused(this.heldRows(call, identity, landed));
      return { kind: "already_done", act: contractAct(landed), ...(this.rowsUnclear(call, identity, landed) ? { rowsUnclear: true as const } : {}) };
    }
    const blind = matching.filter((entry) => entry.state === "may_have_landed" && !entry.lookedSince);
    for (const entry of blind) this.refusedFor.add(entry);
    if (blind[0]) this.leftOut.refused(this.heldRows(call, identity, blind[0]));
    return blind[0] ? { kind: "look_first", act: contractAct(blind[0]) } : { kind: "run" };
  }

  /** How many distinct rows this attempt left out because the record held them done (header). */
  rowsHeldDone(): number {
    return this.leftOut.count(this.ties);
  }

  /** Whether this call declares a lasting act, so that it must be begun before it is sent. */
  lasting(call: AutomationStudioAttemptActCall): boolean {
    return declaresLasting(call);
  }

  /**
   * A lasting call about to be sent: on the persisted record as may have landed once this resolves (header). The
   * caller sends it only on `on_record`, and then answers with `settled`, or `withdrawn` where it turned out no act.
   */
  async begun(call: AutomationStudioAttemptActCall, words: { what?: string | undefined; where?: string | undefined } = {}): Promise<AutomationStudioAttemptActBegun> {
    if (!declaresLasting(call)) return "not_lasting";
    const called = this.identityOf(call.actionId, call.parameters, call.row);
    if (call.row !== undefined) this.noteActedRow(call.row);
    const frozen = this.foreseenForm(call);
    const known = this.sameActs(call, called)[0];
    if (known) {
      this.open.set(call, { entry: known, before: structuredClone(known) });
      this.absorb(known, frozen, called, declaredClasses(call), "may_have_landed");
    } else {
      const entry = this.newEntry(call, { effectApplied: false, uncertain: true, words: { what: words.what ?? "", where: words.where ?? "" } }, called, frozen, "may_have_landed", true);
      this.readCount(entry, call, called);
      this.entries.push(entry);
      this.open.set(call, { entry });
    }
    if (await this.changed()) return "on_record";
    // Not on the record, so not sent: nothing happened, and the failed write is kept for `flushed`.
    this.withdrawn(call);
    return "not_written";
  }

  /** A begun call that proved to be no act (a read, whatever it declared): the record as it stood before it began. */
  withdrawn(call: AutomationStudioAttemptActCall): void {
    if (this.rolledBack(call)) void this.changed();
  }

  /** A call that ran. Records it when it is a lasting act. `uncertain` means it ran and its effect is not known. */
  settled(call: AutomationStudioAttemptActCall, outcome: AutomationStudioAttemptActOutcome): AutomationStudioAttemptAct | undefined {
    const begun = this.rolledBack(call);
    const lasting = declaresLasting(call);
    const uncertain = outcome.uncertain === true;
    const called = this.identityOf(call.actionId, call.parameters, call.row);
    if (!outcome.effectApplied && !uncertain) {
      if (lasting) this.touchUnsettled(called);
      if (begun) void this.changed();
      return undefined;
    }
    if (call.row !== undefined) this.noteActedRow(call.row);
    const ran = outcome.ranWith?.parameters ? this.identityOf(outcome.ranWith.actionId ?? call.actionId, outcome.ranWith.parameters, call.row) : undefined;
    // It answers to the place and fingerprint it was foreseen in too: what the press ran with may hold more than the look it came from did, and the next press may come from such a look.
    const foreseenForm = this.foreseenForm(call);
    const frozen = ran ? { ...ran, keys: [...ran.keys, ...(foreseenForm?.placeKeys ?? [])] } : foreseenForm;
    const state = lasting && !uncertain ? "landed" : "may_have_landed";
    const known = this.sameActs(call, called).find((entry) => lasting || entry.undeclared);
    if (known) {
      const wasUndeclared = known.undeclared === true;
      this.absorb(known, frozen, called, lasting ? declaredClasses(call) : undefined, state);
      if (wasUndeclared && lasting) this.readCount(known, call, called);
      this.landedAt(outcome.step, known);
      this.leftOut.ranOn(known.rows);
      void this.changed();
      return contractAct(known);
    }
    const entry = this.newEntry(call, outcome, called, frozen, state, lasting);
    if (lasting) this.readCount(entry, call, called);
    this.entries.push(entry);
    this.landedAt(outcome.step, entry);
    this.leftOut.ranOn(entry.rows);
    void this.changed();
    return contractAct(entry);
  }

  /**
   * The engine judged a step after its act answered success: a `done when:` that stayed false, an effect that never
   * showed. The press may not have happened, and the record said it had, so it now says may have: never repeated
   * blind, and open to a retry after a look, which a landed act would never be.
   */
  doubted(step: string): void {
    const entry = this.landedBySteps.get(step);
    if (!entry || entry.state !== "landed") return;
    this.landedBySteps.delete(step);
    if (entry.asked !== undefined) entry.landings = Math.max(0, (entry.landings ?? 0) - 1);
    entry.state = "may_have_landed";
    entry.lookedSince = false;
    this.refusedFor.delete(entry);
    entry.at = this.now();
    void this.changed();
  }

  /** An observation ran: an act a call was refused for may now be retried, not blind (header). One nothing refuses, since it declared nothing, is only shown as looked at. */
  looked(): void {
    let changed = false;
    for (const entry of this.entries) {
      if (entry.state !== "may_have_landed" || entry.lookedSince) continue;
      if (!entry.undeclared && !this.refusedFor.has(entry)) continue;
      entry.lookedSince = true;
      changed = true;
    }
    if (changed) void this.changed();
  }

  /** Whether this row already took a lasting act (never by position or handle), in any shape it reached the record in (header). */
  rowDone(row: JsonObject): boolean {
    const identity = automationStudioAttemptActRowIdentity(row);
    if (identity === undefined) return false;
    const same = new Set([identity, ...this.ties.sameAs(row, this.actedRows())]);
    const done = this.entries.some((entry) => stands(entry) && entry.rows.some((held) => same.has(held)) && !this.namesAnotherRow(entry, [identity]));
    if (done) this.leftOut.passedOver(identity);
    return done;
  }

  /** Whether a step's non-row lasting act already landed. A may-have-landed one counts: a step so held is checked, never sent again. */
  stepDone(call: Pick<AutomationStudioAttemptActCall, "actionId" | "parameters" | "row">): boolean {
    const identity = this.identityOf(call.actionId, call.parameters, call.row);
    const found = this.matching(identity).find((entry) => stands(entry) && !(entry.state === "landed" && hasRoom(entry, identity)));
    if (found) this.leftOut.refused(found.rows);
    return found !== undefined;
  }

  /** The act a real run must not do again (`SVC/answer-first/run-acts/`), read by the Flow node's own action, parameters, row and step names. `counted`: one whose count has room may run (header). */
  carried(call: ForRun): AutomationStudioAttemptAct | undefined {
    const identity = this.identityOf(call.actionId, call.parameters, call.row);
    const steps = new Set(call.steps ?? []);
    const room = (entry: AutomationStudioAttemptActEntry) => call.counted === true && entry.state === "landed" && hasRoom(entry, identity);
    const found = this.entries.find((entry) => stands(entry) && !room(entry) && (matches(entry, identity) || (entry.steps ?? []).some((step) => steps.has(step))));
    if (found) for (const row of identity.rows.slice(0, 1)) this.leftOut.passedOver(row);
    if (found && identity.rows.length === 0) this.leftOut.refused(found.rows);
    return found ? contractAct(found) : undefined;
  }

  /** Remembers which row a handle printed in a read belongs to, so a by-hand press on it counts for that row. `oneList`: the rows as one list held them, where an answer carries them twice, to know two rows that are alike from one row said twice. */
  noteReadRows(rows: readonly JsonObject[], oneList: readonly JsonObject[] = rows): void {
    if (rows.length === 0) return;
    this.ties.note(rows, this.actedRows());
    this.leftOut.noteList(oneList.map(automationStudioAttemptActRowIdentity).filter((identity) => identity !== undefined));
    // An act made before the read that lists its row (header of `./row-ties.ts`).
    for (const entry of this.entries) if (entry.rows.length === 0) this.tieLate(entry);
    void this.changed();
  }

  /** Where a call left the page: what a later by-hand act there belongs to (`./row-ties.ts`). */
  notePlace(note: AutomationStudioAttemptActPlaceNote): void {
    const before = JSON.stringify(this.place ?? null);
    const named = note.actedOn === undefined ? [] : this.ties.ofWords(RowTies.wordsOf(note.actedOn));
    const pathOf = (address: string | undefined) => address === undefined ? undefined : RowTies.pathOf(address);
    const path = pathOf(note.location) ?? pathOf(note.url);
    const reached = path === undefined ? [] : this.ties.ofPath(path);
    const rows = named.length > 0 ? named : reached;
    if (rows.length > 0) this.place = { rows, ...(path !== undefined ? { path } : {}) };
    else if (path !== undefined && this.place?.path !== path) this.place = { rows: [], path };
    if (JSON.stringify(this.place ?? null) !== before) void this.changed();
  }

  /** The contract's shape, what a result carries: never an undeclared press. */
  acts(): AutomationStudioAttemptAct[] {
    return this.entries.filter((entry) => !entry.undeclared).map(contractAct);
  }

  /** What a fresh round is told, screened words only. */
  forModel(): JsonObject {
    return {
      rule: MODEL_RULE,
      acts: this.entries.map((entry) => ({
        id: entry.id, what: whatOf(entry), where: entry.where, classes: [...entry.classes], state: entry.state,
        ...(entry.rows.length > 0 ? { onARow: true } : {}),
        ...(entry.undeclared ? { undeclared: true } : {}),
        ...(entry.state === "may_have_landed" ? { lookedSince: entry.lookedSince } : {})
      }))
    };
  }

  data(): AutomationStudioAttemptActRecordData {
    return structuredClone({ kind: "attempt_act_record", schemaVersion: 1, acts: this.entries, rows: this.ties.data(), ...(this.place ? { place: this.place } : {}) });
  }

  /** Waits for every write asked so far; throws the first that failed. */
  async flushed(): Promise<void> {
    await this.writing;
    if (this.failure) throw this.failure.error;
  }

  private identityOf(actionId: string, parameters: JsonObject, row: JsonObject | undefined): Identity {
    const target = automationStudioAttemptActTargetKeys(actionId, parameters);
    const own = row === undefined ? undefined : automationStudioAttemptActRowIdentity(row);
    const printed = own === undefined && target.handle !== undefined ? this.ties.ofHandle(target.handle) : [];
    const rows = own !== undefined ? [own] : printed;
    const same = row === undefined ? this.ties.sameAsHeld(rows, this.actedRows()) : this.ties.sameAs(row, this.actedRows());
    return { ...target, actionId, rows, sameRows: [...new Set([...rows, ...same])] };
  }

  /** Every row an act is on, the only rows another shape of a row can be done by. */
  private actedRows(): Set<string> {
    return new Set(this.entries.flatMap((entry) => entry.rows));
  }

  /** Holds the row an act is on, by its values, so the same row in another shape is known. */
  private noteActedRow(row: JsonObject): void {
    this.ties.note([row], this.actedRows());
  }

  /** The record as it stood before this call began: the entry gone, or as it was. Says whether there was anything to put back. */
  private rolledBack(call: AutomationStudioAttemptActCall): boolean {
    const begun = this.open.get(call);
    if (!begun) return false;
    this.open.delete(call);
    const { entry, before } = begun;
    if (before) {
      for (const key of Object.keys(entry)) delete (entry as Record<string, unknown>)[key];
      Object.assign(entry, before);
    } else {
      this.entries.splice(this.entries.indexOf(entry), 1);
    }
    return true;
  }

  /** Remembers the landing a run's step just made, for `doubted`. */
  private landedAt(step: string | undefined, entry: AutomationStudioAttemptActEntry): void {
    if (step !== undefined && entry.state === "landed") this.landedBySteps.set(step, entry);
  }

  /** Every act this identity is the same act as (header). */
  private matching(identity: Identity): AutomationStudioAttemptActEntry[] {
    return this.entries.filter((entry) => matches(entry, identity));
  }

  /** Every act this call is the same act as, by its own identity and by what the domain says it would be (header). */
  private sameActs(call: AutomationStudioAttemptActCall, identity: Identity): AutomationStudioAttemptActEntry[] {
    const foreseen = this.foreseenOf(call);
    const own = this.matching(identity);
    const found = foreseen ? [...new Set([...own, ...this.entries.filter((entry) => matchesForeseen(entry, foreseen, this.place?.path))])] : own;
    const pressed = this.pressedRows(call, identity);
    const itsKeys = identity.rows.length > 0 || call.row !== undefined ? [] : [...identity.keys, ...(foreseen?.frozen?.keys ?? []), ...(foreseen?.frozen?.placeKeys ?? [])];
    return found.filter((entry) => itsKeys.some((key) => entry.keys.includes(key)) || !this.namesAnotherRow(entry, pressed));
  }

  /** The rows a call is on, as far as it says: its own, a handle's a read printed, or those its foreseen words fit. */
  private pressedRows(call: AutomationStudioAttemptActCall, identity: Identity): string[] {
    return identity.rows.length > 0 ? identity.rows : this.foreseenOf(call)?.named ?? [];
  }

  /** Whether the act's own answer says it was on one row, and this press is on another known to be another (header). */
  private namesAnotherRow(entry: AutomationStudioAttemptActEntry, pressed: readonly string[]): boolean {
    const [row] = pressed;
    if (row === undefined || pressed.length > 1 || entry.rows.includes(row) || !entry.actedOnWords) return false;
    const said = this.ties.ofWords(entry.actedOnWords);
    return said.length === 1 && said[0] !== row && this.ties.toldApart(said[0]!, row);
  }

  /** Whether several rows fit this call and it may not be the one done, as far as anything says (header). */
  private rowsUnclear(call: AutomationStudioAttemptActCall, identity: Identity, entry: AutomationStudioAttemptActEntry): boolean {
    const pressed = this.pressedRows(call, identity);
    if (pressed.length === 0) return false;
    if (pressed.length > 1 || this.leftOut.isSeveral(pressed[0]!)) return true;
    const said = entry.actedOnWords ? this.ties.ofWords(entry.actedOnWords) : [];
    if (said.length === 1 && said[0] === pressed[0]) return false;
    return this.ties.distinct(new Set(entry.rows.flatMap((row) => this.ties.fitsOf(row)))) > 1;
  }

  /** The rows a refused call left out: those it says it is on, else those the act it is refused for is on. */
  private heldRows(call: AutomationStudioAttemptActCall, identity: Identity, entry: AutomationStudioAttemptActEntry): readonly string[] {
    const pressed = this.pressedRows(call, identity);
    return pressed.length > 0 ? pressed : entry.rows;
  }

  /** A call's `foreseen`, read; none for a call that carries its row, which says for itself what it is on. */
  private foreseenOf(call: AutomationStudioAttemptActCall): Foreseen | undefined {
    if (!call.foreseen || call.row !== undefined) return undefined;
    const { words, parameters } = call.foreseen;
    const frozen = parameters ? automationStudioAttemptActTargetKeys(call.actionId, parameters) : undefined;
    const sentence = [words, frozen?.says].filter(Boolean).join(" ");
    const named = sentence ? this.ties.ofControlWords(RowTies.wordsOf(sentence)) : [];
    const acted = this.actedRows();
    const inShapes = (rows: readonly string[]) => new Set([...rows, ...this.ties.sameAsHeld(rows, acted)]);
    return { actionId: call.actionId, frozen, named, namedSame: inShapes(named), onPage: named.length > 0 ? new Set<string>() : inShapes(this.place?.rows ?? []) };
  }

  /** The frozen form a call is foreseen to run with, as an act will answer to it. */
  private foreseenForm(call: AutomationStudioAttemptActCall): Identity | undefined {
    return call.foreseen?.parameters ? this.identityOf(call.actionId, call.foreseen.parameters, call.row) : undefined;
  }

  /** A declared call that answered it did nothing: what it may have done stands, and only a new look lets it try again. */
  private touchUnsettled(identity: Identity): void {
    const open = this.matching(identity).filter((entry) => entry.state === "may_have_landed" && entry.lookedSince);
    for (const entry of open) entry.lookedSince = false;
    if (open.length > 0) void this.changed();
  }

  /** A known act seen again: it answers to these forms too, and a retry that landed settles it. */
  private absorb(entry: AutomationStudioAttemptActEntry, frozen: Identity | undefined, called: Identity, classes: AutomationStudioAttemptActClass[] | undefined, state: AutomationStudioAttemptAct["state"]): void {
    entry.keys = [...new Set([...entry.keys, ...called.keys, ...(frozen?.keys ?? [])])];
    entry.actions = [...new Set([...entry.actions, called.actionId, ...(frozen ? [frozen.actionId] : [])])];
    entry.handleKeys = [...new Set([...entry.handleKeys, ...called.handleKeys])];
    const controls = [...new Set([...(entry.controls ?? []), ...(frozen?.controls ?? []), ...(called.controls ?? [])])];
    if (controls.length > 0) entry.controls = controls;
    if (entry.state !== "landed" || entry.asked !== undefined) {
      if (entry.asked !== undefined && state === "landed") entry.landings = (entry.landings ?? 0) + 1;
      entry.state = state;
      entry.lookedSince = false;
      this.refusedFor.delete(entry);
      // A new landing is a new thing for a run to carry (`SVC/answer-first/run-acts/store.ts`).
      entry.at = this.now();
    }
    if (!classes) return;
    delete entry.undeclared;
    if (classes.length > 0 && entry.classes.length === 0) entry.classes = classes;
  }

  private newEntry(call: AutomationStudioAttemptActCall, outcome: AutomationStudioAttemptActOutcome, called: Identity, frozen: Identity | undefined, state: AutomationStudioAttemptAct["state"], lasting: boolean): AutomationStudioAttemptActEntry {
    const classes = declaredClasses(call);
    const actedOnWords = outcome.actedOn === undefined ? undefined : RowTies.wordsOf(outcome.actedOn);
    const said = actedOnWords ? this.ties.ofWords(actedOnWords) : [];
    const named = said.length > 0 ? said : this.foreseenOf(call)?.named ?? [];
    const rows = called.rows.length > 0 ? called.rows : named.length > 0 ? named : this.place?.rows ?? [];
    const only = rows.length === 1 ? rows[0] : undefined;
    // The frozen form names the act from here on; a handle stops meaning anything when the build ends.
    const key = (frozen?.keys ?? called.keys)[0] ?? called.keys[0]!;
    const words = automationStudioAttemptActScreenedWords(outcome.words, classes);
    const controls = frozen?.controls ?? called.controls;
    return {
      id: automationStudioAttemptActId({ key, row: only }),
      what: words.what, where: words.where, classes, state,
      ...(only !== undefined ? { rowIdentity: only } : {}),
      ...(lasting ? {} : { undeclared: true as const }),
      stage: call.stage,
      actions: [...new Set([call.actionId, ...(frozen ? [frozen.actionId] : [])])],
      keys: [...new Set([...called.keys, ...(frozen?.keys ?? [])])],
      handleKeys: called.handleKeys,
      rows,
      ...(controls ? { controls } : {}),
      lookedSince: false,
      at: this.now(),
      ...(actedOnWords ? { actedOnWords } : {}),
      ...(this.place?.path !== undefined ? { placePath: this.place.path } : {})
    };
  }

  /** The count the request asks for this act, read once, at its first landing. A call about a row has none: it is one per row. */
  private readCount(entry: AutomationStudioAttemptActEntry, call: AutomationStudioAttemptActCall, called: Identity): void {
    if (called.rows.length > 0) return;
    const asked = this.asked?.(call);
    if (asked === undefined || !Number.isSafeInteger(asked) || asked < 2) return;
    entry.asked = asked;
    entry.landings = entry.state === "landed" ? 1 : 0;
  }

  private tieLate(entry: AutomationStudioAttemptActEntry): void {
    const named = entry.actedOnWords ? this.ties.ofWords(entry.actedOnWords) : [];
    const rows = named.length > 0 ? named : entry.placePath ? this.ties.ofPath(entry.placePath) : [];
    if (rows.length === 0) return;
    entry.rows = rows;
    if (rows.length === 1) entry.rowIdentity = rows[0]!;
  }

  /** Written one at a time, in the order asked; each holds the whole record, so a later write still runs after a failed one. Resolves when this write is done, with whether it was. */
  private changed(): Promise<boolean> {
    const persist = this.persist;
    if (!persist) return Promise.resolve(true);
    const snapshot = this.data();
    const written = this.writing.then(async () => {
      try {
        await persist(snapshot);
        return true;
      } catch (error) {
        this.failure ??= { error };
        return false;
      }
    });
    this.writing = written.then(() => undefined);
    return written;
  }
}

/** A call that says it lasts: it declared a class, or claims an instructed act. */
function declaresLasting(call: AutomationStudioAttemptActCall): boolean {
  return declaredClasses(call).length > 0 || typeof call.instructedAct === "string" && call.instructedAct.trim().length > 0;
}

/** The classes a call declared, those Core knows, in Core's order; a word that is not one (`none`) declares nothing. */
function declaredClasses(call: AutomationStudioAttemptActCall): AutomationStudioAttemptActClass[] {
  return readAttemptActClasses(call.consequences.filter((word) => readAttemptActClasses([word]) !== null).slice(0, 10)) ?? [];
}

/** Whether the request asks for this act more times than it has landed, for a call that is about no row (header). */
function hasRoom(entry: AutomationStudioAttemptActEntry, identity: Identity): boolean {
  return identity.rows.length === 0 && entry.asked !== undefined && (entry.landings ?? 0) < entry.asked;
}

/** An act's words, with how many times it landed where the request asked for several: a judge and a person read this as the record of them all. */
function whatOf(entry: AutomationStudioAttemptActEntry): string {
  const landings = entry.landings ?? 0;
  return entry.asked !== undefined && landings > 1 ? `${entry.what} (${landings} times)` : entry.what;
}

/** Whether an entry holds an act that happened or may have, and that a refusal may rest on. */
function stands(entry: AutomationStudioAttemptActEntry): boolean {
  return !entry.undeclared && (entry.state === "landed" || entry.state === "may_have_landed");
}

/** Whether an identity is this entry's act (header). */
function matches(entry: AutomationStudioAttemptActEntry, identity: Identity): boolean {
  const sameKey = identity.keys.some((key) => entry.keys.includes(key));
  if (identity.rows.length === 0) return sameKey;
  if (entry.rows.length === 0) return identity.handleKeys.some((key) => entry.handleKeys.includes(key));
  if (!identity.sameRows.some((row) => entry.rows.includes(row)) || !entry.actions.includes(identity.actionId)) return false;
  return sameKey || !entry.controls || !identity.controls || identity.controls.some((words) => entry.controls!.includes(words));
}

/** Whether what a call is foreseen to be is this entry's act (header). */
function matchesForeseen(entry: AutomationStudioAttemptActEntry, foreseen: Foreseen, path: string | undefined): boolean {
  const { frozen } = foreseen;
  const onAKey = frozen !== undefined && frozen.keys.some((key) => entry.keys.includes(key));
  const sameWords = frozen?.controls !== undefined && entry.controls !== undefined && frozen.controls.some((words) => entry.controls!.includes(words));
  if (entry.actions.includes(foreseen.actionId)) {
    if (entry.rows.some((row) => foreseen.namedSame.has(row)) && (onAKey || sameWords || !entry.controls || !frozen?.controls)) return true;
    if (entry.rows.some((row) => foreseen.onPage.has(row)) && (onAKey || sameWords)) return true;
  }
  if (!frozen || (entry.placePath !== undefined && path !== undefined && entry.placePath !== path)) return false;
  // Tied to another row than this act's, it is not this act, whatever address they share.
  if (entry.rows.length > 0 && (foreseen.namedSame.size > 0 || foreseen.onPage.size > 0)) return false;
  return (entry.rows.length === 0 ? [...frozen.keys, ...frozen.placeKeys] : frozen.wholeKeys).some((key) => entry.keys.includes(key));
}

/** An entry as the contract's act, with nothing it does not name. */
function contractAct(entry: AutomationStudioAttemptActEntry): AutomationStudioAttemptAct {
  return {
    id: entry.id, what: whatOf(entry), where: entry.where, classes: [...entry.classes], state: entry.state,
    ...(entry.rowIdentity !== undefined ? { rowIdentity: entry.rowIdentity } : {}),
    ...(entry.undo ? { undo: { how: entry.undo.how } } : {})
  };
}
