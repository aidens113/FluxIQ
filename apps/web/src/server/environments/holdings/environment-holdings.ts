import type { CommerceHoldings, EnvironmentStore } from "fluxiq/platform";

/**
 * What each account holds of its dedicated browsers, for cloud admission's
 * counted grants: every environment of the account recorded and not being
 * deleted, plus those admitted in this process whose intent is not recorded
 * yet. Claims of one account run one after another, so two admissions cannot
 * both take the last browser; a claimed environment stays counted until its
 * intent is recorded or refused (`settle`), and from then the store counts
 * it. The store is the durable count: a restart loses only claims whose
 * operation had not been recorded, and those operations never ran.
 */
export class EnvironmentHoldings implements CommerceHoldings {
  private readonly pending = new Map<string, Set<string>>();
  private readonly queues = new Map<string, Promise<void>>();

  constructor(private readonly store: Pick<EnvironmentStore, "listByAccount">) {}

  claim(request: { accountId: string; targetId: string; limit: number }): Promise<boolean> {
    return this.serialized(request.accountId, async () => {
      const held = new Set((await this.store.listByAccount(request.accountId))
        .filter((record) => record.accountId === request.accountId && record.desired !== "deleted")
        .map((record) => record.environmentId));
      for (const environmentId of this.pending.get(request.accountId) ?? []) held.add(environmentId);
      if (held.has(request.targetId)) return true;
      if (held.size >= request.limit) return false;
      const pending = this.pending.get(request.accountId) ?? new Set<string>();
      pending.add(request.targetId);
      this.pending.set(request.accountId, pending);
      return true;
    });
  }

  /** The environment's intent was recorded or refused: the store's record, or nothing, counts it from now on. */
  settle(accountId: string, environmentId: string): void {
    const pending = this.pending.get(accountId);
    if (pending === undefined) return;
    pending.delete(environmentId);
    if (pending.size === 0) this.pending.delete(accountId);
  }

  private serialized<T>(accountId: string, task: () => Promise<T>): Promise<T> {
    const previous = this.queues.get(accountId) ?? Promise.resolve();
    const result = previous.then(task);
    const tail = result.then(() => undefined, /* each claim answers its own caller; the queue only orders the next */ () => undefined);
    this.queues.set(accountId, tail);
    void tail.then(() => {
      if (this.queues.get(accountId) === tail) this.queues.delete(accountId);
    });
    return result;
  }
}
