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
// - **A snapshot for the build record**: every act with its owner, whether
//   its brief still has it to undo (`inPlace`), and whether it is left on the
//   site as its brief's settlement answers it (`left`, t772 w7,
//   `../reset-ledger/leftover.ts`): `no` once settled, `possibly` with the condition it
//   failed (`failed`) once closed as one no call can settle.
// - **A brief's ledger records possibly lasting acts** (t593, `./ledger.ts`):
//   a press with an effect that declared no lasting class. The snapshot marks
//   each `possible`; it is never in place to undo, so it refuses nothing, and
//   a phase's start asks the brief's ledger whether it may still be there.
// - **A trial act repeats an explored act of any brief** (L1 build repeats):
//   each brief's ledger is handed every brief's explored acts, asked whenever
//   it matches or judges a trial act, so a whole run the supervisor's ledger
//   records inherits a builder's named destination, named before or after.
// - **Originals per group (t751 R1).** A list read through any brief's gate
//   is an original unless an act of the build touched its group or one whose
//   effect location is unknown sealed every group (`./create-baselines.ts`);
//   no "first act anywhere" cut. Each brief's ledger adopts them.
// - **A plan step's stamp still resolves** (`stepWitnessResolves`, t751 R3):
//   the project reset's `admit` asks it before a trial runs a step.
// - **A list Core cannot read again is lost for the whole build** (t743):
//   every brief's ledger shares one store of them
//   (`../reset-settlement/reach.ts`), so a later brief never looks for it
//   again. The build's acts no call can settle (`unsatisfiable`) and the
//   destination refs it was shown, with where each was read (`issuedRefs`),
//   are read here build-wide, for Core's own wiring.

import { AutomationStudioSiteResetCreateBaselines } from "./create-baselines.ts";
import { AutomationStudioSiteResetControlWitnesses } from "./control-witnesses.ts";
import { AutomationStudioSiteResetStepGaps, automationStudioSiteResetWitnessStampValid, type AutomationStudioSiteResetStepReachAnswer } from "../reset-admission/index.ts";
import type { AutomationStudioSiteResetRead, AutomationStudioSiteResetUnsettleableAct } from "./contracts.ts";
import type { AutomationStudioSiteResetLeftover } from "../reset-ledger/index.ts";
import { AutomationStudioSiteResetReach, automationStudioSiteResetInvalidCollectionGroups, type AutomationStudioSiteResetIssuedRef } from "../reset-settlement/index.ts";
import { AutomationStudioSiteResetLedger, type AutomationStudioSiteResetRecordedAct } from "./ledger.ts";

/** The highest act number `undoes` can name (`^act-[1-9][0-9]{0,3}$`), as a single ledger keeps it. */
const MAX_ACT = 9999;

/** One act in the build's ledger: what the brief's ledger recorded, with its owner always set. */
export type AutomationStudioSiteResetProjectAct = Omit<AutomationStudioSiteResetRecordedAct, "owner" | "stillThere"> & { owner: string };

/** The build's ledger as the build record keeps it. */
export type AutomationStudioSiteResetProjectSnapshot = {
  /** `inPlace`: its brief still has it to undo; `left`, and `failed` where it is closed as one no call can settle: whether it is left, as its brief's settlement answers it (header, t772 w7). */
  acts: Array<AutomationStudioSiteResetProjectAct & { inPlace: boolean; left: AutomationStudioSiteResetLeftover["left"]; failed?: AutomationStudioSiteResetUnsettleableAct["failed"] }>;
  /** The number the next recorded act will take. */
  nextAct: number;
};

export type AutomationStudioSiteResetProjectLedgerOptions = {
  /** Writes the snapshot to the build record; called one write at a time, in order (header). */
  persist?: (snapshot: AutomationStudioSiteResetProjectSnapshot) => Promise<void>;
};

export class AutomationStudioSiteResetProjectLedger {
  private readonly controlWitnesses = new AutomationStudioSiteResetControlWitnesses();
  private readonly createBaselines = new AutomationStudioSiteResetCreateBaselines();
  private readonly stepGaps = new AutomationStudioSiteResetStepGaps(this.createBaselines);
  /** The lists Core cannot read again, for every brief of the build (header). */
  private readonly reach = new AutomationStudioSiteResetReach();
  private readonly briefs = new Map<string, AutomationStudioSiteResetLedger>();
  private readonly acts: AutomationStudioSiteResetProjectAct[] = [];
  private readonly originals = new Map<string, NonNullable<AutomationStudioSiteResetRead["collections"]>[number]>();
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
    if (known) {
      known.adoptOriginalCollections([...this.originals.values()]);
      return known;
    }
    const ledger = new AutomationStudioSiteResetLedger({
      owner: briefId,
      createBaselines: this.createBaselines,
      controlWitnesses: this.controlWitnesses,
      reach: this.reach,
      nextActId: () => this.nextActId(),
      sink: (recorded) => this.recorded(briefId, recorded),
      possible: true,
      // A trial act of any brief repeats an explored act of any brief, its destinations resolved when asked (header).
      buildExplored: () => [...this.briefs.values()].flatMap((brief) => brief.exploredActs())
    });
    ledger.adoptOriginalCollections([...this.originals.values()]);
    this.briefs.set(briefId, ledger);
    return ledger;
  }

  /** Immutable original evidence, per group (header): a group an act touched, or every group once one is sealed, takes none. */
  observed(given: AutomationStudioSiteResetRead): void {
    // A page read whole is one of its lists, as every brief's ledger reads it (`./ledger.ts`, t791).
    const read = this.createBaselines.paged(given);
    this.controlWitnesses.observed(read);
    this.createBaselines.observed(read);
    const collections = read.collections ?? [];
    const invalid = automationStudioSiteResetInvalidCollectionGroups(collections);
    for (const collection of collections) {
      if (invalid.has(collection.group) || this.createBaselines.closed(collection.group)) continue;
      if (!this.originals.has(collection.scope)) this.originals.set(collection.scope, structuredClone(collection));
    }
    for (const brief of this.briefs.values()) brief.adoptOriginalCollections([...this.originals.values()]);
  }

  /**
   * Whether a plan step's witness stamp still resolves (t751 R3, `./project-reset.ts` `admit`): a destination ref the build
   * was shown, its list still valid; a repeated act among the build's explored acts, with a witness of its own; any other
   * control receipt owned by this build. Bare control/own-list and legacy forms never admit a project trial.
   */
  stepWitnessResolves(witness: unknown): boolean {
    if (!automationStudioSiteResetWitnessStampValid(witness)) return false;
    if (witness.via === "legacy") return false;
    if (witness.via === "own_list") return false;
    if (witness.via === "control") return this.controlWitnesses.resolve(witness.ref) !== undefined;
    if (witness.via === "destination") return this.createBaselines.retained(witness.ref) !== undefined;
    if (witness.via === "repeats") return [...this.briefs.values()].some((brief) => brief.exploredActs().some((act) => act.id === witness.act && act.witnessed && act.destinations.length > 0));
    return true;
  }

  /**
   * Where a trial's step with no witness stands in its own tab (t791 fix 2, `../reset-admission/step-gaps.ts`): whether a call there can make one, and
   * the refs read in that tab only. None where the step door was never asked about its node.
   */
  stepReach(step: { definitionId?: string | undefined; ref?: string | undefined }): AutomationStudioSiteResetStepReachAnswer | undefined {
    return this.stepGaps.ofNode(step.definitionId, step.ref);
  }

  /** Every act of the build in the order recorded, with its owner, whether its brief still has it to undo, and whether it is left (header, t772 w7). */
  snapshot(): AutomationStudioSiteResetProjectSnapshot {
    return {
      acts: this.acts.map((act) => {
        // Its own brief's one answer, which that brief's acts to undo and acts listed apart read too (`../reset-ledger/leftover.ts`).
        const left = this.briefs.get(act.owner)?.leftover(act.act);
        return { ...structuredClone(act), inPlace: left?.standing === "in_place", left: left?.left ?? "yes", ...(left?.standing === "unsettleable" ? { failed: left.failed } : {}) };
      }),
      nextAct: this.next
    };
  }

  /** Every act of the build no call can settle, each with its closed condition, in brief order (header, t743). */
  unsatisfiable(): Array<AutomationStudioSiteResetUnsettleableAct & { owner: string }> {
    return [...this.briefs].flatMap(([owner, ledger]) => ledger.unsatisfiable().map((act) => ({ ...act, owner })));
  }

  /** Every destination ref the build was shown, with how many items its list held and where it was read (header, t743). */
  issuedRefs(): AutomationStudioSiteResetIssuedRef[] {
    return this.createBaselines.issuedRefs();
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
    this.acts.push({ act: recorded.act, did: recorded.did, ...(recorded.call !== undefined ? { call: recorded.call } : {}), owner: briefId, ref: recorded.ref, undoable: recorded.undoable, ...(recorded.possible ? { possible: true as const } : {}) });
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
