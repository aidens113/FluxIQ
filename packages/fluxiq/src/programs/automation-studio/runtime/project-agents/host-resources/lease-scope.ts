import { AsyncLocalStorage } from "node:async_hooks";
import type { ClientGatewayHostLease } from "@fluxiq/contracts/client-gateway";
import type { ClientGatewayHostLeaseSource } from "../../../../../client-gateway/service/host-lease/index.ts";
import type { AutomationStudioHostResourceAcquireOptions, AutomationStudioHostResourceScheduler } from "./scheduler.ts";
import type { AutomationStudioHostResourceHolder, AutomationStudioHostResourceLease } from "./types.ts";

interface LeaseFrame {
  readonly lease: AutomationStudioHostResourceLease;
  readonly scheduler: AutomationStudioHostResourceScheduler;
}

const frames = new AsyncLocalStorage<LeaseFrame>();

/**
 * Leases held right now under strict scopes, with the scheduler that granted
 * each. Each counts for the gateway session its grant names; one whose grant
 * names no session counts for every session.
 */
const strictlyHeld = new Map<AutomationStudioHostResourceLease, AutomationStudioHostResourceScheduler>();

/**
 * Runs an agent's work holding a host-resource lease, with the lease in an
 * async-context scope for the whole of that work, so every host command the
 * work issues carries it: Core's client gateway reads it from
 * `AutomationStudioHostLeaseScope.gatewaySource` and stamps it, as it reads the
 * run that sends a command (automation-project-agents-plan, `Host resources and
 * concurrency`). A command issued under a lease that was released or reissued
 * is refused unsent, so a holder's late command never reaches a resource
 * someone else now holds.
 *
 * Strict (the default): while a lease is held under this scope, a command
 * with no lease addressed to the gateway session the lease's grant names is
 * refused, which is what makes "one execution owner per resource" enforced
 * rather than assumed. Commands to other sessions -- another client, another
 * project -- are not affected. A grant that names no session is strict for
 * every session: the conservative reading when the host cannot say where its
 * resource lives.
 */
export class AutomationStudioHostLeaseScope {
  /** What the host hands the client gateway as its `hostLease` source. */
  static readonly gatewaySource: ClientGatewayHostLeaseSource = Object.freeze({
    current: (): ClientGatewayHostLease | undefined => frames.getStore()?.lease,
    isCurrent: (lease: ClientGatewayHostLease): boolean => {
      const frame = frames.getStore();
      return frame !== undefined && sameLease(frame.lease, lease) && frame.scheduler.isCurrent(frame.lease);
    },
    requiresLease: (sessionId: string): boolean => [...strictlyHeld].some(([lease, scheduler]) => (lease.sessionId === undefined || lease.sessionId === sessionId) && scheduler.isCurrent(lease))
  });

  /** The lease the calling async context runs under, or nothing outside any lease scope. */
  static current(): AutomationStudioHostResourceLease | undefined {
    return frames.getStore()?.lease;
  }

  readonly scheduler: AutomationStudioHostResourceScheduler;
  readonly strict: boolean;

  constructor(scheduler: AutomationStudioHostResourceScheduler, options: { readonly strict?: boolean } = {}) {
    this.scheduler = scheduler;
    this.strict = options.strict ?? true;
  }

  /**
   * `scheduler.run` with the lease in scope: waits for a lease for `holder`,
   * runs `work` inside the lease's scope, and releases the lease when the work
   * ends, however it ends. Work the lease outlives -- a promise left running --
   * keeps the scope, and its commands are refused as stale once released.
   */
  run<T>(holder: AutomationStudioHostResourceHolder, work: (lease: AutomationStudioHostResourceLease) => Promise<T>, options: AutomationStudioHostResourceAcquireOptions = {}): Promise<T> {
    return this.scheduler.run(holder, async (lease) => {
      if (this.strict) strictlyHeld.set(lease, this.scheduler);
      try {
        return await frames.run({ lease, scheduler: this.scheduler }, () => work(lease));
      } finally {
        strictlyHeld.delete(lease);
      }
    }, options);
  }
}

function sameLease(held: AutomationStudioHostResourceLease, lease: ClientGatewayHostLease): boolean {
  return held.resourceKey === lease.resourceKey
    && held.epoch === lease.epoch
    && held.holder.role === lease.holder.role
    && held.holder.briefId === lease.holder.briefId;
}
