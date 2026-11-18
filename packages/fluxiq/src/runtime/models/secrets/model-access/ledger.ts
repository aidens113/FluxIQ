// How the last model call or key check on each key went, for a person's model-access state (t924, t928).
// A reading of the last outcome, never a gate: it only reports and never blocks a call, so it may be
// persisted by the host (`persistence`) and a refused or empty key still reads that way after a restart.

import type { ModelAccessCallOutcome } from "@fluxiq/contracts/platform";

/** The key as the ledger sees it: its id and the times that say when its value changed. */
export type AutomationStudioModelAccessLedgerKey = { id: string; updatedAtMs: number; lastRotatedAtMs?: number | undefined };

/** One recorded outcome. `version` is the value's version, so a rename keeps a refusal and a replace clears it. Never a key value. */
export type AutomationStudioModelAccessLedgerEntry = { keyId: string; version: number; outcome: ModelAccessCallOutcome; atMs: number; message?: string | undefined };

/** Where the host keeps the entries between restarts. `read` is called once, when the ledger is first asked or first notes a change; `write` only when an outcome or version changes, and neither after the ledger's `close`. */
export type AutomationStudioModelAccessLedgerPersistence = {
  read(): Promise<unknown>;
  write(entries: AutomationStudioModelAccessLedgerEntry[]): Promise<void>;
};

const OUTCOMES: readonly string[] = ["answered", "provider_refused", "no_credit", "provider_unreachable"];

/** The version of a key's value: when it was last replaced, else when it last changed. */
export function automationStudioModelAccessKeyVersion(key: AutomationStudioModelAccessLedgerKey): number {
  return key.lastRotatedAtMs ?? key.updatedAtMs;
}

/**
 * How the last call or check on each key went. With `persistence`, the
 * entries are read back once, when the ledger is first asked (`whenLoaded`)
 * or first notes a change, never as it is made: an instance that never reads
 * or records model access never opens its store. Every read and write of the
 * store is the ledger's own and ends with it: `close` starts no more, and
 * settles once those already running have (t928: a read started as the
 * instance was made outlived the instance's close and held its database open).
 */
export class AutomationStudioModelAccessLedger {
  private readonly entries = new Map<string, AutomationStudioModelAccessLedgerEntry>();
  private readonly listeners = new Set<() => void>();
  /** Every read or write of the store not yet settled; none of them rejects. */
  private readonly running = new Set<Promise<void>>();
  private loading: Promise<void> | undefined;
  private closed = false;

  constructor(private readonly now: () => number = Date.now, private readonly persistence?: AutomationStudioModelAccessLedgerPersistence) {}

  /** Settles once the persisted entries have been read (never rejects), reading them at the first call; an outcome noted meanwhile wins over an older persisted one. Once closed it reads nothing. */
  whenLoaded(): Promise<void> {
    this.loading ??= this.closed ? Promise.resolve() : this.track(this.load());
    return this.loading;
  }

  /**
   * Ends the ledger's use of its store: no read or write starts after this
   * call, and the promise settles (never rejects) once every one already
   * running has. Outcomes noted afterwards are still read in memory. Safe to
   * call again.
   */
  close(): Promise<void> {
    this.closed = true;
    return Promise.all([...this.running]).then(() => undefined);
  }

  /** `message` is a failure's own words, kept so the state says what the chat said. */
  note(key: AutomationStudioModelAccessLedgerKey, outcome: ModelAccessCallOutcome, message?: string): { outcome: ModelAccessCallOutcome; atMs: number } {
    const atMs = this.now();
    const version = automationStudioModelAccessKeyVersion(key);
    const before = this.entries.get(key.id);
    this.entries.set(key.id, { keyId: key.id, version, outcome, atMs, ...(message ? { message } : {}) });
    if (!before || before.version !== version || before.outcome !== outcome) this.changed();
    return { outcome, atMs };
  }

  /** A free key check's result, recorded as a call's outcome is. */
  noteCheck(key: AutomationStudioModelAccessLedgerKey, result: { outcome: ModelAccessCallOutcome; message?: string | undefined }): { outcome: ModelAccessCallOutcome; atMs: number } {
    return this.note(key, result.outcome, result.message);
  }

  lastCall(key: AutomationStudioModelAccessLedgerKey): { outcome: ModelAccessCallOutcome; atMs: number } | null {
    const entry = this.current(key);
    return entry ? { outcome: entry.outcome, atMs: entry.atMs } : null;
  }

  /** The failure's own words for the key's last call, when it kept any. */
  lastMessage(key: AutomationStudioModelAccessLedgerKey): string | undefined {
    return this.current(key)?.message;
  }

  /** Called when a key's recorded outcome or version changes, and only then. Returns the way to stop listening. */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  private current(key: AutomationStudioModelAccessLedgerKey): AutomationStudioModelAccessLedgerEntry | undefined {
    const entry = this.entries.get(key.id);
    return entry && entry.version === automationStudioModelAccessKeyVersion(key) ? entry : undefined;
  }

  private changed(): void {
    for (const listener of [...this.listeners]) {
      try { listener(); } catch { /* best-effort: one listener must not stop the others */ }
    }
    const persistence = this.persistence;
    if (!persistence || this.closed) return;
    // Written behind the read, so the stored entries are merged in first. Whether to write is decided as it starts,
    // so none starts after close.
    const writing = this.whenLoaded().then(async () => {
      if (!this.closed) await persistence.write([...this.entries.values()]);
    });
    // A write that fails leaves the in-memory reading, which is all a restart-less host needs, and is said with its
    // error's kind only (a store's words can carry anything): the reading only reports and never blocks a call.
    void this.track(writing).catch((error: unknown) => {
      console.warn(`The model-access ledger could not keep a key's last outcome (${error instanceof Error ? error.name : "non_error"}).`);
    });
  }

  /** `work`, kept among the store's running reads and writes until it settles, however it settles; what `close` waits for. */
  private track(work: Promise<void>): Promise<void> {
    const ended = work.then(() => undefined, () => undefined);
    this.running.add(ended);
    void ended.then(() => { this.running.delete(ended); });
    return work;
  }

  private async load(): Promise<void> {
    if (!this.persistence) return;
    try {
      const stored = await this.persistence.read();
      if (!Array.isArray(stored)) return;
      for (const raw of stored) {
        const entry = readEntry(raw);
        if (entry && !this.entries.has(entry.keyId)) this.entries.set(entry.keyId, entry);
      }
    } catch { /* best-effort: an unreadable store starts the reading empty */ }
  }
}

function readEntry(value: unknown): AutomationStudioModelAccessLedgerEntry | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const { keyId, version, outcome, atMs, message } = value as Record<string, unknown>;
  if (typeof keyId !== "string" || !keyId || typeof version !== "number" || !Number.isFinite(version)) return undefined;
  if (typeof outcome !== "string" || !OUTCOMES.includes(outcome) || typeof atMs !== "number" || !Number.isFinite(atMs) || atMs < 0) return undefined;
  return { keyId, version, outcome: outcome as ModelAccessCallOutcome, atMs, ...(typeof message === "string" && message ? { message: message.slice(0, 600) } : {}) };
}
