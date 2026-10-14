import type { AutomationStudioHostResourceLease } from "./types.ts";

/** A command carried a lease that was released or reissued; the holder no longer owns the resource. */
export class AutomationStudioHostResourceStaleLeaseError extends Error {
  readonly lease: AutomationStudioHostResourceLease;

  constructor(lease: AutomationStudioHostResourceLease) {
    super(`Host resource ${lease.resourceKey} epoch ${lease.epoch} is no longer held by ${lease.holder.role} ${lease.holder.briefId}.`);
    this.name = "AutomationStudioHostResourceStaleLeaseError";
    this.lease = lease;
  }
}
