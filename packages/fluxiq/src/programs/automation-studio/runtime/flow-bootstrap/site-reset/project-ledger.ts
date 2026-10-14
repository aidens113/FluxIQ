// The lasting-act ledger of a whole project build (automation-project-agents
// plan, `Build record` and `Concurrent dispatch`; unit A4b). Today's ledger is
// one per build and unpersisted (`./ledger.ts`); a project build runs several
// briefs, possibly at once, and each needs a ledger of its own acts.
//
// - **`forBrief(briefId)` returns a real ledger**, the same one each time for
//   the same brief: an `AutomationStudioSiteResetLedger` whose acts are that
//   brief's alone. A brief claims, is asked for, and is compared on only its
//   own acts -- `stillThere`'s check of "a line another act added" included,
//   since another brief's acts sit in another ledger. With capacity above 1
//   the briefs run in separate host resources that share no lasting state
//   (the host-resource port's obligation), so another brief's act is not on
//   this brief's site; with capacity 1 they run one after another.
// - **Act ids are unique across the build.** One counter hands every brief's
//   ledger its next `act-N`, so an id in the build record, a receipt or the
//   supervisor's triage names exactly one act of exactly one brief.
// - **One serialized writer.** Every act any brief records is appended here in
//   the order recorded, attributed to its brief, and the optional `persist`
//   port is called with the build's snapshot one write at a time, in order;
//   a write never starts before the one before it ended. Each write holds the
//   whole snapshot, so a later write still runs after a failed one; the first
//   failure is kept and thrown from `flushed()`, never dropped.
// - **A snapshot for the build record**: every act with its owner, and whether
//   its brief still has it to undo.

import { AutomationStudioSiteResetLedger, type AutomationStudioSiteResetRecordedAct } from "./ledger.ts";

/** The highest act number `undoes` can name (`^act-[1-9][0-9]{0,3}$`), as a single ledger keeps it. */
const MAX_ACT = 9999;

/** One act in the build's ledger: what the brief's ledger recorded, with its owner always set. */
export type AutomationStudioSiteResetProjectAct = Omit<AutomationStudioSiteResetRecordedAct, "owner" | "stillThere"> & { owner: string };

/** The build's ledger as the build record keeps it. */
export type AutomationStudioSiteResetProjectSnapshot = {
  acts: Array<AutomationStudioSiteResetProjectAct & { inPlace: boolean }>;
  /** The number the next recorded act will take. */
  nextAct: number;
};

export type AutomationStudioSiteResetProjectLedgerOptions = {
  /** Writes the snapshot to the build record; called one write at a time, in order (header). */
  persist?: (snapshot: AutomationStudioSiteResetProjectSnapshot) => Promise<void>;
};

export class AutomationStudioSiteResetProjectLedger {
  private readonly briefs = new Map<string, AutomationStudioSiteResetLedger>();
  private readonly acts: AutomationStudioSiteResetProjectAct[] = [];
  private next = 1;
  private writing: Promise<void> = Promise.resolve();
  private failure: { error: unknown } | undefined;
  private readonly persist: AutomationStudioSiteResetProjectLedgerOptions["persist"];

  constructor(options: AutomationStudioSiteResetProjectLedgerOptions = {}) {
    this.persist = options.persist;
  }

  /** The brief's own ledger, made on first ask and the same one after (header). */
  forBrief(briefId: string): AutomationStudioSiteResetLedger {
    if (typeof briefId !== "string" || !briefId) throw new TypeError("A brief's ledger needs a non-empty brief id.");
    const known = this.briefs.get(briefId);
    if (known) return known;
    const ledger = new AutomationStudioSiteResetLedger({
      owner: briefId,
      nextActId: () => this.nextActId(),
      sink: (recorded) => this.recorded(briefId, recorded)
    });
    this.briefs.set(briefId, ledger);
    return ledger;
  }

  /** Every act of the build in the order recorded, with its owner and whether its brief still has it to undo. */
  snapshot(): AutomationStudioSiteResetProjectSnapshot {
    const inPlace = new Set([...this.briefs.values()].flatMap((ledger) => ledger.inPlace().map((act) => act.act)));
    return { acts: this.acts.map((act) => ({ ...structuredClone(act), inPlace: inPlace.has(act.act) })), nextAct: this.next };
  }

  /** Waits for every write asked so far; throws the first that failed. */
  async flushed(): Promise<void> {
    await this.writing;
    if (this.failure) throw this.failure.error;
  }

  private nextActId(): string | undefined {
    if (this.next > MAX_ACT) return undefined;
    const id = `act-${this.next}`;
    this.next += 1;
    return id;
  }

  private recorded(briefId: string, recorded: AutomationStudioSiteResetRecordedAct): void {
    this.acts.push({ act: recorded.act, did: recorded.did, ...(recorded.call !== undefined ? { call: recorded.call } : {}), owner: briefId, ref: recorded.ref, undoable: recorded.undoable });
    const persist = this.persist;
    if (!persist) return;
    const snapshot = this.snapshot();
    // Chained, so writes run one at a time in the order asked; a failure is kept for `flushed()` (header).
    this.writing = this.writing.then(async () => {
      try {
        await persist(snapshot);
      } catch (error) {
        this.failure ??= { error };
      }
    });
  }
}
