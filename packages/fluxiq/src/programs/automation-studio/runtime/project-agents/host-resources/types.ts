/** The agent that holds, or waits for, a host resource: its role and the brief it serves. */
export interface AutomationStudioHostResourceHolder {
  readonly role: string;
  readonly briefId: string;
}

/**
 * What a domain's port hands back when it grants a resource. `epoch` must be
 * strictly greater than every epoch the port granted before for the same
 * `resourceKey`, so a lease reissued after a release is told apart from the
 * one it replaced.
 */
export interface AutomationStudioHostResourceGrant {
  readonly resourceKey: string;
  readonly epoch: number;
}

/** A grant bound to the holder it was issued to. Every host command a role issues carries its lease. */
export interface AutomationStudioHostResourceLease extends AutomationStudioHostResourceGrant {
  readonly holder: AutomationStudioHostResourceHolder;
}

/** The port's answer to `acquire`: a grant, or that it has no resource free right now. */
export type AutomationStudioHostResourceAcquireResult = AutomationStudioHostResourceGrant | "at_capacity";

/**
 * The host-resource port a domain implements (a browser context, a device).
 * Core's scheduler grants leases through it and never holds more than
 * `capacity` at once.
 *
 * Obligation: a domain that declares `capacity` above 1 guarantees that its
 * resources share no lasting state -- separate contexts, never tabs of one
 * profile -- so two agents holding leases at once cannot see or undo each
 * other's acts. Core cannot check this; it is part of this contract.
 *
 * `acquire` may answer `"at_capacity"` even while Core holds fewer than
 * `capacity` leases (a resource held outside Core); the scheduler then waits
 * for a release or an explicit retry. `release` receives a lease the port
 * granted and that the scheduler has not released before.
 */
export interface AutomationStudioHostResourcePort {
  readonly capacity: number;
  acquire(holder: AutomationStudioHostResourceHolder): AutomationStudioHostResourceAcquireResult | Promise<AutomationStudioHostResourceAcquireResult>;
  release(lease: AutomationStudioHostResourceLease): void | Promise<void>;
}

/** What the scheduler holds and who waits, for diagnostics and tests. */
export interface AutomationStudioHostResourceSnapshot {
  readonly capacity: number;
  readonly held: readonly AutomationStudioHostResourceLease[];
  readonly waiting: readonly AutomationStudioHostResourceHolder[];
}
