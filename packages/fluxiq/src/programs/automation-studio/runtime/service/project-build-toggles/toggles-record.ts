import { AutomationStudioExploredToggles } from "../../flow-bootstrap/index.ts";
import type { AutomationStudioExploredToggle } from "../../flow-bootstrap/script-statements/index.ts";
import { AutomationStudioProjectRecordRefusal, type AutomationStudioProjectBuildRecordStore, type AutomationStudioProjectBuildRef, type AutomationStudioProjectBuildToggle } from "../../project-agents/index.ts";

// The build's toggles, written into the build record as they are recorded
// (t792; debug run-mvswfjbq-d0a95f6e, fix 2): every press the domain answered
// as a toggle, while exploring or in a trial's pass, with the node, handles,
// trial nodes and signature a later step on the same control is held to
// (`flow-bootstrap/explored-toggles.ts`). That run's record could not say
// whether its trial's toggle had been recorded at all, nor which step it was
// tied to.
//
// One record of toggles per build (`AutomationStudioProjectBuildTogglesRecord.toggles`):
// the one the build's trial environment carries, which its whole and subflow
// trials record into, else one made for that environment, so every brief of
// the build and its trials share it as `../project-build/brief-ports.ts` says. One writer per
// record (`of`), bound to the build's record once it exists (`bind`), as the
// acts' writer is (`../project-build/acts-record.ts`): each place a toggle can be recorded --
// a brief's exploration call, a subflow trial, a whole trial -- asks it to
// `sync`, and it writes each toggle it has not written yet, once, in the order
// recorded. A toggle the record refuses is kept in `unrecorded()` with the
// refusal's code; any other failure is thrown from `flushed()`. What a record
// kept is a record of toggles again (`restored`), with each trial press's
// parameters, the identity its step is tied by.

const WRITERS = new WeakMap<AutomationStudioExploredToggles, AutomationStudioProjectBuildTogglesRecord>();
const MADE = new WeakMap<TrialEnvironment, AutomationStudioExploredToggles>();

/** A build's trial environment, as far as its toggles go (`../project-build/whole-trials.ts`). */
type TrialEnvironment = { readonly exploredToggles?: unknown };

type Records = Pick<AutomationStudioProjectBuildRecordStore, "recordToggle">;

export class AutomationStudioProjectBuildTogglesRecord {
  private record: { records: Records; ref: AutomationStudioProjectBuildRef } | undefined;
  /** Each toggle written or being written, by its whole value. */
  private readonly written = new Set<string>();
  private writing: Promise<void> = Promise.resolve();
  private failure: { error: unknown } | undefined;
  private readonly left: string[] = [];

  private constructor(private readonly toggles: AutomationStudioExploredToggles) {}

  /** The build's one record of toggles: its trial environment's, or one kept for that environment (header). */
  static toggles(environment: TrialEnvironment): AutomationStudioExploredToggles {
    const shared = environment.exploredToggles;
    if (shared instanceof AutomationStudioExploredToggles) return shared;
    const known = MADE.get(environment);
    if (known) return known;
    const made = new AutomationStudioExploredToggles();
    MADE.set(environment, made);
    return made;
  }

  /**
   * The toggles a build record kept, as a record of toggles again (t792): each
   * with its node, call, handles, trial nodes and their parameters, signature
   * and `idempotentWith`, so a step submitted after a reload is tied exactly as
   * it was before (`flow-bootstrap/script-statements/toggle-tie.ts`).
   */
  static restored(kept: readonly AutomationStudioProjectBuildToggle[]): AutomationStudioExploredToggles {
    return new AutomationStudioExploredToggles(kept.map(({ recordedAt: _at, from: _from, ...toggle }) => toggle));
  }

  /** The one writer of `toggles`, made on first ask. */
  static of(toggles: AutomationStudioExploredToggles): AutomationStudioProjectBuildTogglesRecord {
    const known = WRITERS.get(toggles);
    if (known) return known;
    const made = new AutomationStudioProjectBuildTogglesRecord(toggles);
    WRITERS.set(toggles, made);
    return made;
  }

  /** Writes into this build's record from now on, starting with every toggle recorded so far. */
  bind(records: Records, ref: AutomationStudioProjectBuildRef): void {
    this.record = { records, ref };
    this.sync();
  }

  /** Writes every toggle not written yet, in the order recorded, one write at a time; nothing before the record is bound. */
  sync(): void {
    const record = this.record;
    if (!record) return;
    for (const toggle of this.toggles.list()) {
      const key = JSON.stringify(toggle);
      if (this.written.has(key)) continue;
      this.written.add(key);
      this.writing = this.writing.then(() => this.write(record, toggle));
    }
  }

  /** Waits for every write asked so far; throws the first that failed for a reason other than the record's own refusal. */
  async flushed(): Promise<void> {
    await this.writing;
    if (this.failure) throw this.failure.error;
  }

  /** The toggles the record refused, each as `<node> (code)`. */
  unrecorded(): readonly string[] {
    return [...this.left];
  }

  private async write(record: { records: Records; ref: AutomationStudioProjectBuildRef }, toggle: AutomationStudioExploredToggle): Promise<void> {
    try {
      await record.records.recordToggle(record.ref, {
        from: toggle.trialNodes?.length ? "trial" : "explored",
        node: toggle.node,
        ...(toggle.callId ? { callId: toggle.callId } : {}),
        handles: [...toggle.handles],
        ...(!toggle.trialNodes?.length && toggle.target !== undefined ? { target: structuredClone(toggle.target) } : {}),
        ...(toggle.trialNodes?.length ? { trialNodes: [...toggle.trialNodes] } : {}),
        ...(toggle.trialNodes?.length && toggle.trialParameters ? { trialParameters: structuredClone(toggle.trialParameters) } : {}),
        signature: structuredClone(toggle.signature),
        ...(toggle.beforeSignature ? { beforeSignature: structuredClone(toggle.beforeSignature) } : {}),
        ...(toggle.idempotentWith ? { idempotentWith: toggle.idempotentWith } : {})
      });
    } catch (error) {
      if (error instanceof AutomationStudioProjectRecordRefusal) {
        this.left.push(`${toggle.node} (${error.code})`);
        return;
      }
      this.failure ??= { error };
    }
  }
}
