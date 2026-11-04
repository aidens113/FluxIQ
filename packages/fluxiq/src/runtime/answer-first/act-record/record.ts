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
//   may_have_landed   refused until an observation ran after it (`looked`): the retry
//                     is then not blind. Its state stays until a call settles it.
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

import { type AutomationStudioAttemptAct, type AutomationStudioAttemptActClass, readAttemptActClasses } from "@fluxiq/contracts/automation";
import type { JsonObject } from "../../../core/index.ts";
import type {
  AutomationStudioAttemptActAdmission,
  AutomationStudioAttemptActCall,
  AutomationStudioAttemptActEntry,
  AutomationStudioAttemptActOutcome,
  AutomationStudioAttemptActPlaceNote,
  AutomationStudioAttemptActRecordData
} from "./contracts.ts";
import { automationStudioAttemptActId, automationStudioAttemptActRowIdentity, automationStudioAttemptActTargetKeys, type AutomationStudioAttemptActTargetKeys } from "./identity/index.ts";
import { parseAutomationStudioAttemptActRecordData } from "./record-data.ts";
import { AutomationStudioAttemptActRowTies as RowTies } from "./row-ties.ts";
import { automationStudioAttemptActScreenedWords } from "./words.ts";

/** What a fresh round is told about the record, in words that teach nothing about any site. */
const MODEL_RULE = "These acts already happened in this task or may have. Never repeat one: count what landed as done and carry on with what is left. Look at the page before retrying one that may have landed.";

type Identity = AutomationStudioAttemptActTargetKeys & { actionId: string; rows: string[] };
type ForRun = { actionId: string; parameters: JsonObject; row?: JsonObject | undefined; steps?: readonly string[] | undefined };

export class AutomationStudioAttemptActRecord {
  private readonly entries: AutomationStudioAttemptActEntry[];
  private readonly ties: RowTies;
  private place: AutomationStudioAttemptActRecordData["place"];
  private readonly persist: ((data: AutomationStudioAttemptActRecordData) => Promise<void>) | undefined;
  private readonly now: () => number;
  private writing: Promise<void> = Promise.resolve();
  private failure: { error: unknown } | undefined;
  private readonly asked: ((call: AutomationStudioAttemptActCall) => number | undefined) | undefined;

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

  /** Whether this call may be dispatched (header). */
  admit(call: AutomationStudioAttemptActCall): AutomationStudioAttemptActAdmission {
    const identity = this.identityOf(call.actionId, call.parameters, call.row);
    const matching = this.matching(identity).filter((entry) => !entry.undeclared);
    const landed = matching.find((entry) => entry.state === "landed" && !hasRoom(entry, identity));
    if (landed) return { kind: "already_done", act: contractAct(landed) };
    const blind = matching.find((entry) => entry.state === "may_have_landed" && !entry.lookedSince);
    return blind ? { kind: "look_first", act: contractAct(blind) } : { kind: "run" };
  }

  /** A call that ran. Records it when it is a lasting act. `uncertain` means it ran and its effect is not known. */
  settled(call: AutomationStudioAttemptActCall, outcome: AutomationStudioAttemptActOutcome): AutomationStudioAttemptAct | undefined {
    const lasting = declaresLasting(call);
    const uncertain = outcome.uncertain === true;
    const called = this.identityOf(call.actionId, call.parameters, call.row);
    if (!outcome.effectApplied && !uncertain) {
      if (lasting) this.touchUnsettled(called);
      return undefined;
    }
    const frozen = outcome.ranWith?.parameters ? this.identityOf(outcome.ranWith.actionId ?? call.actionId, outcome.ranWith.parameters, call.row) : undefined;
    const state = lasting && !uncertain ? "landed" : "may_have_landed";
    const known = this.matching(called).find((entry) => lasting || entry.undeclared);
    if (known) {
      const wasUndeclared = known.undeclared === true;
      this.absorb(known, frozen, called, lasting ? declaredClasses(call) : undefined, state);
      if (wasUndeclared && lasting) this.readCount(known, call, called);
      this.changed();
      return contractAct(known);
    }
    const entry = this.newEntry(call, outcome, called, frozen, state, lasting);
    if (lasting) this.readCount(entry, call, called);
    this.entries.push(entry);
    this.changed();
    return contractAct(entry);
  }

  /** An observation ran: anything that may have landed may now be retried, not blind. */
  looked(): void {
    let changed = false;
    for (const entry of this.entries) {
      if (entry.state !== "may_have_landed" || entry.lookedSince) continue;
      entry.lookedSince = true;
      changed = true;
    }
    if (changed) this.changed();
  }

  /** Whether this row already took a lasting act (never by position or handle). */
  rowDone(row: JsonObject): boolean {
    const identity = automationStudioAttemptActRowIdentity(row);
    return identity !== undefined && this.entries.some((entry) => stands(entry) && entry.rows.includes(identity));
  }

  /** Whether a step's non-row lasting act already landed. A may-have-landed one counts: a step so held is checked, never sent again. */
  stepDone(call: Pick<AutomationStudioAttemptActCall, "actionId" | "parameters" | "row">): boolean {
    const identity = this.identityOf(call.actionId, call.parameters, call.row);
    return this.matching(identity).some((entry) => stands(entry) && !(entry.state === "landed" && hasRoom(entry, identity)));
  }

  /** The act a real run must not do again (`SVC/answer-first/run-acts/`), read by the Flow node's own action, parameters, row and step names. */
  carried(call: ForRun): AutomationStudioAttemptAct | undefined {
    const identity = this.identityOf(call.actionId, call.parameters, call.row);
    const steps = new Set(call.steps ?? []);
    const found = this.entries.find((entry) => stands(entry) && (matches(entry, identity) || (entry.steps ?? []).some((step) => steps.has(step))));
    return found ? contractAct(found) : undefined;
  }

  /** Remembers which row a handle printed in a read belongs to, so a by-hand press on it counts for that row. */
  noteReadRows(rows: readonly JsonObject[]): void {
    if (rows.length === 0) return;
    this.ties.note(rows);
    // An act made before the read that lists its row (header of `./row-ties.ts`).
    for (const entry of this.entries) if (entry.rows.length === 0) this.tieLate(entry);
    this.changed();
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
    if (JSON.stringify(this.place ?? null) !== before) this.changed();
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
    return { ...target, actionId, rows: own !== undefined ? [own] : printed };
  }

  /** Every act this identity is the same act as (header). */
  private matching(identity: Identity): AutomationStudioAttemptActEntry[] {
    return this.entries.filter((entry) => matches(entry, identity));
  }

  /** A declared call that answered it did nothing: what it may have done stands, and only a new look lets it try again. */
  private touchUnsettled(identity: Identity): void {
    const open = this.matching(identity).filter((entry) => entry.state === "may_have_landed" && entry.lookedSince);
    for (const entry of open) entry.lookedSince = false;
    if (open.length > 0) this.changed();
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
    const named = actedOnWords ? this.ties.ofWords(actedOnWords) : [];
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
      ...(rows.length === 0 && this.place?.path !== undefined ? { placePath: this.place.path } : {})
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

  /** Written one at a time, in the order asked; each holds the whole record, so a later write still runs after a failed one. */
  private changed(): void {
    const persist = this.persist;
    if (!persist) return;
    const snapshot = this.data();
    this.writing = this.writing.then(async () => {
      try {
        await persist(snapshot);
      } catch (error) {
        this.failure ??= { error };
      }
    });
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
  if (!identity.rows.some((row) => entry.rows.includes(row)) || !entry.actions.includes(identity.actionId)) return false;
  return sameKey || !entry.controls || !identity.controls || identity.controls.some((words) => entry.controls!.includes(words));
}

/** An entry as the contract's act, with nothing it does not name. */
function contractAct(entry: AutomationStudioAttemptActEntry): AutomationStudioAttemptAct {
  return {
    id: entry.id, what: whatOf(entry), where: entry.where, classes: [...entry.classes], state: entry.state,
    ...(entry.rowIdentity !== undefined ? { rowIdentity: entry.rowIdentity } : {}),
    ...(entry.undo ? { undo: { how: entry.undo.how } } : {})
  };
}
