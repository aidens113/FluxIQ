import { AutomationStudioHostResourcePortContractError } from "./port-contract-error.ts";
import { AutomationStudioHostResourceStaleLeaseError } from "./stale-lease-error.ts";
import type {
  AutomationStudioHostResourceGrant,
  AutomationStudioHostResourceHolder,
  AutomationStudioHostResourceLease,
  AutomationStudioHostResourcePort,
  AutomationStudioHostResourceSnapshot
} from "./types.ts";

export interface AutomationStudioHostResourceAcquireOptions {
  /** Aborting removes the waiter from the queue; it never acquires, and its promise rejects with the signal's reason. */
  readonly signal?: AbortSignal;
}

interface Waiter {
  readonly holder: AutomationStudioHostResourceHolder;
  readonly signal: AbortSignal | undefined;
  readonly resolve: (lease: AutomationStudioHostResourceLease) => void;
  readonly reject: (error: unknown) => void;
  readonly onAbort: () => void;
  state: "queued" | "acquiring" | "settled";
}

/**
 * Grants host-resource leases through a domain's port: at most `capacity`
 * at once, counting resources still being released, waiters served first in,
 * first out. Callers enqueue in the order they want served (the dispatcher
 * enqueues in dependency order). Waiting costs nothing but time.
 *
 * One acquisition is asked of the port at a time, so the head of the queue is
 * always asked first. When the port answers `"at_capacity"` the head stays at
 * the head and the queue waits for a release or `retryWaiting()`.
 *
 * A holder (`{ role, briefId }`) holds or waits for at most one lease; a
 * second request while it holds or waits is refused, since with capacity 1 it
 * would wait on itself forever.
 *
 * A waiter whose signal aborts while its acquisition is in flight is settled
 * when the port answers: a late grant goes straight back to the port and the
 * waiter rejects with the abort reason (or with the port's release failure).
 */
export class AutomationStudioHostResourceScheduler {
  readonly capacity: number;
  private readonly port: AutomationStudioHostResourcePort;
  private readonly held = new Map<string, AutomationStudioHostResourceLease>();
  private readonly lastEpoch = new Map<string, number>();
  private readonly queue: Waiter[] = [];
  private acquiring: Waiter | undefined;
  private releasing = 0;
  private blocked = false;

  constructor(port: AutomationStudioHostResourcePort) {
    const capacity = port.capacity;
    if (!Number.isSafeInteger(capacity) || capacity < 1) {
      throw new AutomationStudioHostResourcePortContractError(`Host resource capacity must be a whole number of at least 1, got ${String(capacity)}.`);
    }
    this.capacity = capacity;
    this.port = port;
  }

  /** Waits for a lease for `holder`. Resolves with the lease; rejects if aborted, refused, or the port fails. */
  acquire(holder: AutomationStudioHostResourceHolder, options: AutomationStudioHostResourceAcquireOptions = {}): Promise<AutomationStudioHostResourceLease> {
    const { signal } = options;
    return new Promise<AutomationStudioHostResourceLease>((resolve, reject) => {
      const refusal = this.refusalFor(holder);
      if (refusal) {
        reject(refusal);
        return;
      }
      if (signal?.aborted) {
        reject(signal.reason);
        return;
      }
      const waiter: Waiter = {
        holder: Object.freeze({ role: holder.role, briefId: holder.briefId }),
        signal,
        resolve,
        reject,
        onAbort: () => this.abandon(waiter),
        state: "queued"
      };
      signal?.addEventListener("abort", waiter.onAbort, { once: true });
      this.queue.push(waiter);
      this.pump();
    });
  }

  /** Runs `work` while holding a lease and releases it when the holder ends, however it ends. */
  async run<T>(holder: AutomationStudioHostResourceHolder, work: (lease: AutomationStudioHostResourceLease) => Promise<T>, options: AutomationStudioHostResourceAcquireOptions = {}): Promise<T> {
    const lease = await this.acquire(holder, options);
    try {
      return await work(lease);
    } finally {
      await this.release(lease);
    }
  }

  /**
   * Releases a current lease through the port and hands its place to the next
   * waiter. Releasing a stale lease, or the same lease twice, does nothing and
   * answers false. The lease is stale from the moment this is called, even if
   * the port's release then fails.
   */
  async release(lease: AutomationStudioHostResourceLease): Promise<boolean> {
    if (!this.isCurrent(lease)) return false;
    const held = this.held.get(lease.resourceKey) as AutomationStudioHostResourceLease;
    this.held.delete(lease.resourceKey);
    await this.returnToPort(held);
    return true;
  }

  /** True while `lease` is the one the scheduler holds for its resource; false once released or reissued. */
  isCurrent(lease: AutomationStudioHostResourceLease): boolean {
    const held = this.held.get(lease.resourceKey);
    return held !== undefined
      && held.epoch === lease.epoch
      && held.holder.role === lease.holder.role
      && held.holder.briefId === lease.holder.briefId;
  }

  /** Refuses a command whose lease was released or reissued. */
  assertCurrent(lease: AutomationStudioHostResourceLease): void {
    if (!this.isCurrent(lease)) throw new AutomationStudioHostResourceStaleLeaseError(lease);
  }

  /** Asks the port again after it answered `"at_capacity"`; the domain calls this when a resource frees outside Core. */
  retryWaiting(): void {
    this.blocked = false;
    this.pump();
  }

  snapshot(): AutomationStudioHostResourceSnapshot {
    const waiting = [...(this.acquiring ? [this.acquiring] : []), ...this.queue].map((waiter) => waiter.holder);
    return { capacity: this.capacity, held: [...this.held.values()], waiting };
  }

  private refusalFor(holder: AutomationStudioHostResourceHolder): Error | undefined {
    if (typeof holder?.role !== "string" || !holder.role || typeof holder.briefId !== "string" || !holder.briefId) {
      return new TypeError("A host resource holder needs a non-empty role and briefId.");
    }
    const same = (other: AutomationStudioHostResourceHolder) => other.role === holder.role && other.briefId === holder.briefId;
    const holds = [...this.held.values()].some((lease) => same(lease.holder));
    const waits = (this.acquiring !== undefined && same(this.acquiring.holder)) || this.queue.some((waiter) => same(waiter.holder));
    if (holds || waits) return new Error(`${holder.role} ${holder.briefId} already holds or waits for a host resource.`);
    return undefined;
  }

  private abandon(waiter: Waiter): void {
    if (waiter.state !== "queued") return;
    const index = this.queue.indexOf(waiter);
    if (index >= 0) this.queue.splice(index, 1);
    this.settle(waiter, () => waiter.reject(waiter.signal?.reason));
    this.pump();
  }

  private settle(waiter: Waiter, outcome: () => void): void {
    waiter.state = "settled";
    waiter.signal?.removeEventListener("abort", waiter.onAbort);
    outcome();
  }

  private pump(): void {
    if (this.acquiring || this.blocked) return;
    const waiter = this.queue[0];
    if (!waiter) return;
    if (this.held.size + this.releasing >= this.capacity) return;
    this.queue.shift();
    waiter.state = "acquiring";
    this.acquiring = waiter;
    void this.attempt(waiter);
  }

  private async attempt(waiter: Waiter): Promise<void> {
    let result: Awaited<ReturnType<AutomationStudioHostResourcePort["acquire"]>>;
    try {
      result = await this.port.acquire(waiter.holder);
    } catch (error) {
      this.acquiring = undefined;
      this.settle(waiter, () => waiter.reject(error));
      this.pump();
      return;
    }
    this.acquiring = undefined;
    if (result === "at_capacity") {
      this.waitAgain(waiter);
      return;
    }
    let lease: AutomationStudioHostResourceLease;
    try {
      lease = this.admit(result, waiter.holder);
    } catch (error) {
      this.settle(waiter, () => waiter.reject(error));
      this.pump();
      return;
    }
    if (waiter.signal?.aborted) {
      await this.giveBackLateGrant(waiter, lease);
      return;
    }
    this.held.set(lease.resourceKey, lease);
    this.settle(waiter, () => waiter.resolve(lease));
    this.pump();
  }

  private waitAgain(waiter: Waiter): void {
    if (waiter.signal?.aborted) {
      this.settle(waiter, () => waiter.reject(waiter.signal?.reason));
      this.pump();
      return;
    }
    waiter.state = "queued";
    this.queue.unshift(waiter);
    this.blocked = true;
  }

  private async giveBackLateGrant(waiter: Waiter, lease: AutomationStudioHostResourceLease): Promise<void> {
    try {
      await this.returnToPort(lease);
      this.settle(waiter, () => waiter.reject(waiter.signal?.reason));
    } catch (error) {
      this.settle(waiter, () => waiter.reject(error));
    }
  }

  private async returnToPort(lease: AutomationStudioHostResourceLease): Promise<void> {
    this.releasing += 1;
    try {
      await this.port.release(lease);
    } finally {
      this.releasing -= 1;
      this.blocked = false;
      this.pump();
    }
  }

  private admit(grant: AutomationStudioHostResourceGrant, holder: AutomationStudioHostResourceHolder): AutomationStudioHostResourceLease {
    if (typeof grant?.resourceKey !== "string" || !grant.resourceKey || !Number.isSafeInteger(grant.epoch)) {
      throw new AutomationStudioHostResourcePortContractError("The host resource port granted a lease without a resource key and a whole-number epoch.");
    }
    if (grant.sessionId !== undefined && (typeof grant.sessionId !== "string" || !grant.sessionId)) {
      throw new AutomationStudioHostResourcePortContractError("The host resource port granted a lease with a session id that is not a non-empty string.");
    }
    if (this.held.has(grant.resourceKey)) {
      throw new AutomationStudioHostResourcePortContractError(`The host resource port granted ${grant.resourceKey}, which is already leased.`);
    }
    const last = this.lastEpoch.get(grant.resourceKey);
    if (last !== undefined && grant.epoch <= last) {
      throw new AutomationStudioHostResourcePortContractError(`The host resource port reissued ${grant.resourceKey} at epoch ${grant.epoch}, not above ${last}.`);
    }
    this.lastEpoch.set(grant.resourceKey, grant.epoch);
    return Object.freeze({ resourceKey: grant.resourceKey, epoch: grant.epoch, ...(grant.sessionId !== undefined ? { sessionId: grant.sessionId } : {}), holder });
  }
}
