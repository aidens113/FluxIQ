// How the last model call on each key went, for a person's model-access state (t924). Per host
// instance and in memory: a reading of the last call, not a record, and a restart starts from
// "ready" until a call says otherwise.

import type { ModelAccessCallOutcome } from "@fluxiq/contracts/platform";

/** How the last call on each key went, keyed by key id and the key's change time, so a replaced key starts clean. */
export class AutomationStudioModelAccessLedger {
  private readonly calls = new Map<string, { keyUpdatedAtMs: number; outcome: ModelAccessCallOutcome; atMs: number; message?: string | undefined }>();
  constructor(private readonly now: () => number = Date.now) {}

  /** `message` is a failure's own words, kept so the state says what the chat said (a balance refusal is not a bad key). */
  note(key: { id: string; updatedAtMs: number }, outcome: ModelAccessCallOutcome, message?: string): { outcome: ModelAccessCallOutcome; atMs: number } {
    const atMs = this.now();
    this.calls.set(key.id, { keyUpdatedAtMs: key.updatedAtMs, outcome, atMs, ...(message ? { message } : {}) });
    return { outcome, atMs };
  }

  lastCall(key: { id: string; updatedAtMs: number }): { outcome: ModelAccessCallOutcome; atMs: number } | null {
    const call = this.calls.get(key.id);
    return call && call.keyUpdatedAtMs === key.updatedAtMs ? { outcome: call.outcome, atMs: call.atMs } : null;
  }

  /** The failure's own words for the key's last call, when it kept any. */
  lastMessage(key: { id: string; updatedAtMs: number }): string | undefined {
    const call = this.calls.get(key.id);
    return call && call.keyUpdatedAtMs === key.updatedAtMs ? call.message : undefined;
  }
}
