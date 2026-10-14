import type {
  AutomationStudioHostResourceAcquireResult,
  AutomationStudioHostResourceHolder,
  AutomationStudioHostResourceLease,
  AutomationStudioHostResourcePort
} from "../index.ts";

export interface StubHostOptions {
  /** How many resources the host declares and owns. */
  readonly capacity: number;
  /** Resources held outside Core: the host answers `at_capacity` while fewer than this many are free. */
  readonly heldOutside?: number;
}

/**
 * A host-resource port for tests: `capacity` resources named `resource-1`...,
 * a fresh epoch on every grant, and a log of what was asked. `heldOutside`
 * makes it answer `at_capacity` below the declared capacity.
 */
export class StubHost implements AutomationStudioHostResourcePort {
  readonly capacity: number;
  heldOutside: number;
  /** Every acquire asked of the host, including those answered `at_capacity`. */
  asked = 0;
  readonly acquired: AutomationStudioHostResourceHolder[] = [];
  readonly released: AutomationStudioHostResourceLease[] = [];
  private readonly busy = new Set<string>();
  private epoch = 0;

  constructor(options: StubHostOptions) {
    this.capacity = options.capacity;
    this.heldOutside = options.heldOutside ?? 0;
  }

  async acquire(holder: AutomationStudioHostResourceHolder): Promise<AutomationStudioHostResourceAcquireResult> {
    this.asked += 1;
    await Promise.resolve();
    if (this.busy.size + this.heldOutside >= this.capacity) return "at_capacity";
    const resourceKey = this.freeKey();
    this.busy.add(resourceKey);
    this.epoch += 1;
    this.acquired.push(holder);
    return { resourceKey, epoch: this.epoch };
  }

  async release(lease: AutomationStudioHostResourceLease): Promise<void> {
    await Promise.resolve();
    if (!this.busy.delete(lease.resourceKey)) throw new Error(`Stub host released ${lease.resourceKey}, which it had not granted.`);
    this.released.push(lease);
  }

  inUse(): number {
    return this.busy.size;
  }

  private freeKey(): string {
    for (let index = 1; index <= this.capacity; index += 1) {
      const key = `resource-${index}`;
      if (!this.busy.has(key)) return key;
    }
    throw new Error("Stub host has no free resource.");
  }
}
