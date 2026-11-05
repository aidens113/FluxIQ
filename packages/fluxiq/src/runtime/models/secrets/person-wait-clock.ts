// Time a Flow's work spent waiting for a person, which no time limit should count.
//
// The hard rule: a task ends only with its result, its budget gone, or a person
// stopping it. A locked key waits for hours if the person is away, and the limits
// above a model call read a wall clock (`docs/working/answer-first-plan/reports/
// model-key-unlock.md`, "What could end a task during a long wait"). So each wait is
// recorded here against its Flow, and a limit's clock is `clock(scope)`: the time now,
// less what that Flow has spent waiting for a person. One Flow's wait lends no time to
// another's, so a person who never comes back cannot lift anyone else's limit.

/** Whose work is waiting. */
export type AutomationStudioPersonWaitScope = { projectId: string; flowId: string };

type Entry = { heldMs: number; waiting: number; since: number; touchedAtMs: number };

/** Flows remembered at once, oldest finished first: a long-lived process must not grow without end. */
const MAX_REMEMBERED_FLOWS = 2_000;

export class AutomationStudioPersonWaitClock {
  private readonly entries = new Map<string, Entry>();
  private readonly now: () => number;

  constructor(now: () => number = Date.now) {
    this.now = now;
  }

  /** A wait began; the function returned ends it, once. Overlapping waits on one Flow count as one stretch of time. */
  begin(scope: AutomationStudioPersonWaitScope): () => void {
    const key = keyOf(scope);
    const now = this.now();
    const entry = this.entries.get(key) ?? { heldMs: 0, waiting: 0, since: now, touchedAtMs: now };
    if (entry.waiting === 0) entry.since = now;
    entry.waiting += 1;
    entry.touchedAtMs = now;
    this.entries.delete(key);
    this.entries.set(key, entry);
    this.prune();
    let ended = false;
    return () => {
      if (ended) return;
      ended = true;
      entry.waiting -= 1;
      if (entry.waiting === 0) entry.heldMs += Math.max(0, this.now() - entry.since);
      entry.touchedAtMs = this.now();
    };
  }

  /** How long this Flow has waited for a person so far, the wait in progress included. */
  heldMs(scope: AutomationStudioPersonWaitScope): number {
    const entry = this.entries.get(keyOf(scope));
    if (!entry) return 0;
    return entry.heldMs + (entry.waiting > 0 ? Math.max(0, this.now() - entry.since) : 0);
  }

  /** A clock for a limit on this Flow's work: it stands still while the Flow waits for a person. */
  clock(scope: AutomationStudioPersonWaitScope): () => number {
    return () => this.now() - this.heldMs(scope);
  }

  private prune(): void {
    if (this.entries.size <= MAX_REMEMBERED_FLOWS) return;
    for (const [key, entry] of this.entries) {
      if (this.entries.size <= MAX_REMEMBERED_FLOWS) return;
      if (entry.waiting === 0) this.entries.delete(key);
    }
  }
}

function keyOf(scope: AutomationStudioPersonWaitScope): string {
  return JSON.stringify([scope.projectId, scope.flowId]);
}

/** The process's own: a wait records here, and a limit on the same Flow reads it. */
export const automationStudioPersonWaitClock = new AutomationStudioPersonWaitClock();
