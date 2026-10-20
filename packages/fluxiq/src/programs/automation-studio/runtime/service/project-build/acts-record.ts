import type { AutomationStudioActionConsequence } from "../../action-permissions/index.ts";
import type { AutomationStudioSiteResetCalls, AutomationStudioSiteResetProjectLedger, AutomationStudioSiteResetTrialAct } from "../../flow-bootstrap/site-reset/index.ts";
import { AutomationStudioProjectRecordRefusal, type AutomationStudioProjectBuildActOwner, type AutomationStudioProjectBuildRecordStore, type AutomationStudioProjectBuildRef } from "../../project-agents/index.ts";
import { AUTOMATION_STUDIO_PROJECT_BUILD_SUPERVISOR_LEDGER } from "./supervisor-ledger.ts";

// The project ledger's acts, written into the build record as they are
// recorded (t551; plan, `Build record`: "persisted ... as the build proceeds,
// never at the end"), so the record names every act of the build after a
// restart, not only while this process holds the ledger.
//
// Every act is written, with its owner and its lasting classes: a builder's or
// repair's, a reset brief's own, the supervisor's whole trials' (filed under
// `./supervisor-ledger.ts`), and one the person's instruction rather than the
// brief permitted. The ledger's own acts carry no class, so the class is taken
// where the act is recorded: from what the domain declared for the exploration
// call (`calls`, the gate's `explored`) and from each trial step's own
// consequences (`trialRan`, a builder's subflow trial or a whole trial). Each
// place an act can be recorded tells this writer, which then writes every act
// the ledger recorded since, one write at a time, in the order recorded.
//
// One writer per project ledger (`of`), so the whole trials -- made in the
// service before the project build's record exists -- and the briefs share it;
// it writes once the build has bound it to its record (`bind`). An act the
// record refuses is kept in `unrecorded()` with the refusal's code; a write
// that fails for any other reason is kept and thrown from `flushed()`, as the
// ledger's own persistence does.

/** The classes an act is recorded for (`flow-bootstrap/site-reset/ledger.ts`): the ones a reset may have to look for, and the two it never can. */
const LASTING: ReadonlySet<AutomationStudioActionConsequence> = new Set(["create_new", "modify_existing", "delete", "move_money", "send_or_publish"]);
/** What a record entry's description may hold. */
const MAX_DESCRIPTION = 500;

const WRITERS = new WeakMap<AutomationStudioSiteResetProjectLedger, AutomationStudioProjectBuildActsRecord>();

type Records = Pick<AutomationStudioProjectBuildRecordStore, "read" | "recordLastingAct">;

export class AutomationStudioProjectBuildActsRecord {
  /** The classes each act's call or trial step declared, by the ref the ledger records the act under. */
  private readonly declared = new Map<string, readonly AutomationStudioActionConsequence[]>();
  private record: { records: Records; ref: AutomationStudioProjectBuildRef } | undefined;
  private written = 0;
  private writing: Promise<void> = Promise.resolve();
  private failure: { error: unknown } | undefined;
  private readonly left: string[] = [];

  private constructor(private readonly ledger: AutomationStudioSiteResetProjectLedger) {}

  /** The one writer of `ledger`'s acts, made on first ask. */
  static of(ledger: AutomationStudioSiteResetProjectLedger): AutomationStudioProjectBuildActsRecord {
    const known = WRITERS.get(ledger);
    if (known) return known;
    const made = new AutomationStudioProjectBuildActsRecord(ledger);
    WRITERS.set(ledger, made);
    return made;
  }

  /** Writes into this build's record from now on, starting with every act recorded so far. */
  bind(records: Records, ref: AutomationStudioProjectBuildRef): void {
    this.record = { records, ref };
    this.sync();
  }

  /** `calls`, with each explored call's declared classes kept and the acts it recorded written. */
  calls(calls: AutomationStudioSiteResetCalls): AutomationStudioSiteResetCalls {
    return {
      ...(calls.createBaseline ? { createBaseline: (declared, reference) => calls.createBaseline!(declared, reference) } satisfies Pick<AutomationStudioSiteResetCalls, "createBaseline"> : {}),
      ...(calls.destinationReceipts ? { destinationReceipts: () => calls.destinationReceipts!() } : {}),
      claim: (undoes, reference) => calls.claim(undoes, reference),
      target: (act, declared) => calls.target(act, declared),
      explored: (call) => {
        if (call.declared) this.declared.set(call.callId, [...call.declared.consequences]);
        calls.explored(call);
        this.sync();
      }
    };
  }

  /** A trial's steps were recorded as acts (`trialRan`): keeps each step's classes and writes the acts. */
  trialRan(acts: readonly AutomationStudioSiteResetTrialAct[], trialRunId: string | undefined): void {
    for (const act of acts) this.declared.set(`${trialRunId ?? "trial"}#step-${act.step}`, [...act.consequences]);
    this.sync();
  }

  /** Writes every act recorded since the last write, in order, one write at a time; nothing before the record is bound. */
  sync(): void {
    const record = this.record;
    if (!record) return;
    const acts = this.ledger.snapshot().acts.slice(this.written);
    this.written += acts.length;
    for (const act of acts) {
      const consequences = (this.declared.get(act.ref) ?? []).filter((consequence) => LASTING.has(consequence));
      const entry = { act: act.act, owner: act.owner, did: act.did, consequences, undoable: act.undoable };
      this.writing = this.writing.then(() => this.write(record, entry));
    }
  }

  /** Waits for every write asked so far; throws the first that failed for a reason other than the record's own refusal. */
  async flushed(): Promise<void> {
    await this.writing;
    if (this.failure) throw this.failure.error;
  }

  /** The acts the record refused, each as `act-N (code)`. */
  unrecorded(): readonly string[] {
    return [...this.left];
  }

  private async write(record: { records: Records; ref: AutomationStudioProjectBuildRef }, entry: { act: string; owner: string; did: string; consequences: AutomationStudioActionConsequence[]; undoable: boolean }): Promise<void> {
    try {
      const owner = await this.ownerOf(record, entry.owner);
      const words = `${entry.act}: ${entry.did}`;
      await record.records.recordLastingAct(record.ref, {
        act: entry.act, owner, consequences: [...new Set(entry.consequences)], undoable: entry.undoable,
        description: words.length > MAX_DESCRIPTION ? `${words.slice(0, MAX_DESCRIPTION - 3)}...` : words
      });
    } catch (error) {
      if (error instanceof AutomationStudioProjectRecordRefusal) {
        this.left.push(`${entry.act} (${error.code})`);
        return;
      }
      this.failure ??= { error };
    }
  }

  /** The supervisor, or the brief that owns the act under the role it ran as (`project-agents/dispatch/run-brief.ts`). */
  private async ownerOf(record: { records: Records; ref: AutomationStudioProjectBuildRef }, owner: string): Promise<AutomationStudioProjectBuildActOwner> {
    if (owner === AUTOMATION_STUDIO_PROJECT_BUILD_SUPERVISOR_LEDGER) return { role: "supervisor" };
    const view = await record.records.read(record.ref);
    const brief = view?.record.briefs.find((entry) => entry.brief.briefId === owner)?.brief;
    return { role: brief?.kind === "repair" ? "repair" : "builder", briefId: owner };
  }
}
